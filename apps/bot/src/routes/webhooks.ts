import { Router } from 'express';
import type { Request, Response } from 'express';
import { env } from '../lib/env.js';
import { evolutionSendPresence, evolutionSendText, evolutionSendImage } from '../services/evolution.js';
import { getCatalog, searchCatalog, formatItemLine } from '../services/catalog.js';
import { getState, setState, seenDedupe, markDedupe } from '../services/state.js';
import { getContactRule, setContactRule } from '../services/contacts.js';
import { getConversationRule, setConversationRule } from '../services/rules.js';
import { getSocket } from '../services/socket.js';
import { matchFaq, matchPlaybook, renderTemplate, logDecision, getIntelligenceSettings } from '../services/intelligence.js';
import { createHash } from 'node:crypto';
import type { ConvState } from '../services/state.js';

export const webhookRouter = Router();

function getText(msg: any): string {
  const m = msg?.message || {};
  if (typeof m.conversation === 'string') return m.conversation;
  if (typeof m.extendedTextMessage?.text === 'string') return m.extendedTextMessage.text;
  if (typeof m.imageMessage?.caption === 'string') return m.imageMessage.caption;
  if (typeof m.videoMessage?.caption === 'string') return m.videoMessage.caption;
  // buttons/list replies
  if (typeof m.buttonsResponseMessage?.selectedDisplayText === 'string') return m.buttonsResponseMessage.selectedDisplayText;
  if (typeof m.listResponseMessage?.title === 'string') return m.listResponseMessage.title;
  return '';
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

function isMessagesUpsertEvent(body: any): { ok: boolean; event: string } {
  const evRaw = String(body?.event ?? '');
  const ev = evRaw.toLowerCase();

  const ok =
    ev === 'messages.upsert' ||
    ev === 'messages_upsert' ||
    ev === 'messagesupsert' ||
    evRaw === 'MESSAGES_UPSERT';

  return { ok, event: evRaw };
}

/**
 * In-memory debounce/aggregation map. For each remoteJid we keep the last
 * received message and a timer. When a new message arrives we reset the
 * timer. Once the timer fires we process the aggregated message. This
 * prevents the bot from replying multiple times when the user sends
 * several short messages in quick succession. The window duration is
 * randomized between env.humanizerMinMs and env.humanizerMaxMs.
 */
type AggregatorEntry = {
  /** map key = `${instance}:${remoteJid}` */
  key: string;
  instance: string;
  remoteJid: string;
  fromMe: boolean;
  /** last N msg ids seen within the aggregation window */
  msgIds: string[];
  /** last N raw texts (kept in order) */
  texts: string[];
  /** timestamp of the first message in the window */
  firstAt: number;
  /** timestamp of the last message in the window */
  lastAt: number;
  /** how many messages were received in the current window */
  count: number;
  timer: NodeJS.Timeout | null;
  /** scheduled send timer (typing delay). If a new message arrives, we cancel it. */
  sendTimer: NodeJS.Timeout | null;
};

const aggregators = new Map<string, AggregatorEntry>();

/**
 * Pick a random integer between min and max inclusive.
 */
function randInt(min: number, max: number): number {
  // Defensive: swap if provided in the wrong order
  const a = Math.min(min, max);
  const b = Math.max(min, max);
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

/**
 * Compute a simple SHA1 hash for a given string. Used to detect
 * repeated replies and avoid sending the same fallback over and over.
 */
function hashString(str: string): string {
  return createHash('sha1').update(str).digest('hex');
}

/**
 * Compute a human-like delay before sending a message. It picks a
 * random base delay between env.delayBaseMinMs and env.delayBaseMaxMs
 * then adds a per-character component between env.delayCharMinMs and
 * env.delayCharMaxMs times the length of the reply. The final delay
 * is capped at 8 seconds to avoid excessive waiting.
 */
function computeHumanDelay(reply: string): number {
  const base = randInt(env.delayBaseMinMs, env.delayBaseMaxMs);
  const perChar = randInt(env.delayCharMinMs, env.delayCharMaxMs);
  const delay = base + reply.length * perChar;
  return Math.min(delay, 8000);
}

/**
 * Choose a random element from an array. If the array is empty it
 * returns an empty string.
 */
function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function chance(p: number): boolean {
  return Math.random() < p;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Optionally split longer multi-line replies into two WhatsApp messages.
 * This tends to feel more human and reduces "wall of text".
 */
async function sendTextHuman(instance: string, number: string, reply: string): Promise<void> {
  if (!env.splitReplies) {
    await evolutionSendText(instance, number, reply);
    return;
  }

  const lines = reply.split('\n').filter((l) => l.trim().length > 0);
  // Only split when there is a clear header and body.
  const p = Number.isFinite(env.splitRepliesProb) ? Math.min(1, Math.max(0, env.splitRepliesProb)) : 0.25;
  if (lines.length >= 3 && chance(p)) {
    const first = lines[0];
    const rest = lines.slice(1).join('\n');
    await evolutionSendText(instance, number, first);
    await sleep(randInt(700, 1200));
    await evolutionSendText(instance, number, rest);
    return;
  }

  await evolutionSendText(instance, number, reply);
}

/**
 * Detect short acknowledgements like "ok", "jaja", "ah".
 * We treat these as low-signal and reply only occasionally.
 */
function isAckOnly(text: string): boolean {
  const t = normalize(text);
  if (!t) return false;
  // Keep it tight so we don't misclassify real queries
  if (t.length > 16) return false;
  return /^(ok|oki|okey|dale|(?:de\s+una|deuna)|jaja+|aja|ah+|mmm+|joya|genial|buenisimo|buen[ií]simo|listo|gracias|grx|sorry|sry|👍|👌)$/.test(t);
}

/** Extract an option number like "2", "opcion 3", "la 1". */
function extractOptionNumber(text: string): number | null {
  const t = normalize(text);
  const m = t.match(/\b(opcion|opci[oó]n|opt|la|el)?\s*([1-8])\b/);
  if (!m) return null;
  const n = Number(m[2]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Handle an aggregated message. This function runs outside of the
 * HTTP request/response cycle. It reads the current conversation
 * state, determines intent and generates a reply. The reply is then
 * scheduled to be sent with a human-like delay. Conversation state is
 * persisted back to the database.
 */
async function handleAggregatedMessage(key: string, instance: string, remoteJid: string, rawText: string, msgId: string) {
  try {
    const number = remoteJid.split('@')[0];

    // Do not respond to admin/test numbers.
    if (env.testNumbers && env.testNumbers.length > 0 && env.testNumbers.includes(number)) {
      const e = aggregators.get(key);
      if (e?.timer) clearTimeout(e.timer);
      if (e?.sendTimer) clearTimeout(e.sendTimer);
      aggregators.delete(key);
      return;
    }

    // Hard override: private numbers (env) are treated as HUMAN_ONLY.
    // This is a fast-path for "números privados" and avoids a DB round-trip.
    if (env.privateNumbers && env.privateNumbers.length > 0 && env.privateNumbers.includes(number)) {
      const e = aggregators.get(key);
      if (e?.timer) clearTimeout(e.timer);
      if (e?.sendTimer) clearTimeout(e.sendTimer);
      aggregators.delete(key);
      // Best-effort: persist the mode for audit/visibility in admin UIs.
      try {
        await setContactRule(number, 'HUMAN_ONLY', 'private_numbers_env');
      } catch {
        // ignore
      }
      return;
    }

    // Respect contact rules: if a number is configured with bot_mode OFF or HUMAN_ONLY we
    // should not automatically reply. The rule is stored in the database and retrieved
    // via getContactRule(). When OFF or HUMAN_ONLY we simply clean up and abort.
    try {
      const rule = await getContactRule(number);
      if (rule && rule !== 'ON') {
        const e = aggregators.get(key);
        if (e?.timer) clearTimeout(e.timer);
        if (e?.sendTimer) clearTimeout(e.sendTimer);
        aggregators.delete(key);
        return;
      }
    } catch (err) {
      // If rule lookup fails, we log and proceed with default behaviour.
      console.error('Failed to get contact rule for', number, err);
    }

    // Respect conversation-level rules: if a specific conversation is set to OFF or HUMAN_ONLY skip replies.
    try {
      const convRule = await getConversationRule(instance, remoteJid);
      if (convRule && convRule !== 'ON') {
        const e = aggregators.get(key);
        if (e?.timer) clearTimeout(e.timer);
        if (e?.sendTimer) clearTimeout(e.sendTimer);
        aggregators.delete(key);
        return;
      }
    } catch (err) {
      console.error('Failed to get conversation rule for', instance, remoteJid, err);
    }

    // Conversation state
    const state: ConvState = await getState(instance, remoteJid);
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    const aggEntry = aggregators.get(key);
    const cleanup = () => {
      const e = aggregators.get(key);
      if (e?.timer) clearTimeout(e.timer);
      if (e?.sendTimer) clearTimeout(e.sendTimer);
      aggregators.delete(key);
    };

    const scheduleReply = (reply: string, nextState: any, imageUrl?: string) => {
      const delayMs = computeHumanDelay(reply);

      // Best-effort typing indicator. Don’t block on errors.
      void evolutionSendPresence(instance, number, 'composing', Math.min(delayMs, 5000)).catch(() => { });

      const timer = setTimeout(async () => {
        const sentIso = new Date().toISOString();
        try {
          // If an image URL is provided, send the image with the reply as caption. Otherwise send text.
          if (imageUrl) {
            await evolutionSendImage(instance, number, imageUrl, reply);
          } else {
            await sendTextHuman(instance, number, reply);
          }
          await setState(instance, remoteJid, {
            ...nextState,
            lastBotAt: sentIso,
            last_bot_reply_at: sentIso,
            last_bot_reply_hash: hashString(reply)
          });
          // Emit socket event for outgoing message
          const sock = getSocket();
          if (sock) {
            sock.emit('send.message', {
              instance,
              number,
              text: reply,
              imageUrl: imageUrl ?? null
            });
          }
        } catch (err) {
          console.error(err);
        } finally {
          cleanup();
        }
      }, delayMs);

      if (aggEntry) {
        if (aggEntry.sendTimer) clearTimeout(aggEntry.sendTimer);
        aggEntry.sendTimer = timer;
        aggregators.set(key, aggEntry);
      }
    };

    // Cooldown: avoid replying too often
    if (state.lastBotAt) {
      const last = Date.parse(state.lastBotAt);
      if (!Number.isNaN(last) && now - last < env.cooldownMs) {
        cleanup();
        return;
      }
    }

    // Test mode: when the user explicitly says they are testing.
    const isTestMode = /(probando|testeando|test\b|configurando|\bestoy\s+(?:probando|testeando|configurando)|\bchatbot\b|no\s+le\s+des\s+bola|no\s+respondas|no\s+contestes)/i.test(rawText);
    if (isTestMode) {
      const testReply = 'jaja ok 😄 decime qué querés testear: búsqueda, precios o checkout';
      scheduleReply(testReply, {
        ...state,
        stage: 'idle',
        last_intent: 'test_mode'
      });
      return;
    }

    // Intelligence: FAQ / Playbooks (panel-configurable)
    try {
      const settings = await getIntelligenceSettings();
      const faq = await matchFaq(rawText);
      if (faq?.answer) {
        const reply = renderTemplate(String(faq.answer), { state, settings });
        await logDecision({ instance, remoteJid, intent: 'faq', confidence: 0.99, data: { faqId: faq.id } });
        scheduleReply(reply, {
          ...state,
          stage: state.stage ?? 'idle',
          last_intent: 'faq',
          last_faq_id: faq.id
        });
        return;
      }

      const pb = await matchPlaybook(rawText);
      if (pb?.template) {
        const reply = renderTemplate(String(pb.template), { state, settings, playbook: pb });
        await logDecision({ instance, remoteJid, intent: String(pb.intent ?? 'playbook'), confidence: 0.9, data: { playbookId: pb.id } });
        scheduleReply(reply, {
          ...state,
          stage: state.stage ?? 'idle',
          last_intent: String(pb.intent ?? 'playbook'),
          last_playbook_id: pb.id
        });
        return;
      }
    } catch (e) {
      // Best-effort. Never break the bot if intelligence subsystem fails.
      console.error('intelligence match error', e);
    }

    // Low-signal acknowledgements: reply only occasionally and only when not
    // waiting for the user to specify a query.
    if (isAckOnly(rawText)) {
      if (state.stage === 'awaiting_query') {
        cleanup();
        return;
      }
      if (!chance(0.35)) {
        cleanup();
        return;
      }

      const ackVariants = ['Dale 👍', 'Ok', 'Perfecto', 'Genial 🙌'];
      const ackReply = pickOne(ackVariants);
      scheduleReply(ackReply, {
        ...state,
        stage: state.stage ?? 'idle'
      });
      return;
    }

    // Determine if user wants to hand off to human
    const wantsHandoff = /(comprar|reservar|senar|se[ñn]a|pagar|quiero\s+ya|transferencia)/i.test(rawText);
    if (wantsHandoff) {
      // Mark this conversation as handled by a human from now on
      try {
        await setConversationRule(instance, remoteJid, 'HUMAN_ONLY');
      } catch (err) {
        console.error('Failed to set conversation rule on handoff', err);
      }
      const handoffMsg = 'Perfecto 🙌 Te paso con un asesor para cerrarlo rápido. Decime tu nombre y zona, y qué producto querés.';
      scheduleReply(handoffMsg, {
        ...state,
        stage: 'idle',
        last_intent: 'handoff'
      });
      return;
    }

    const catalog = await getCatalog();
console.log("[CATALOG] loaded", {
  count: catalog.length,
  sample: catalog.slice(0, 2).map((x) => ({ id: x.id, name: x.name, price: (x as any).priceNumber ?? (x as any).priceArs })),
});

    // Quick follow-up handling when we previously showed options.
    // Examples: user replies "2" or asks "y el precio?".
    const lastHits: string[] = Array.isArray((state as any).last_hits) ? (state as any).last_hits : [];
    const lastHitsAtStr: string | undefined = (state as any).last_hits_at;
    const lastHitsAt = lastHitsAtStr ? Date.parse(lastHitsAtStr) : NaN;
    const lastHitsFresh = lastHits.length > 0 && !Number.isNaN(lastHitsAt) && now - lastHitsAt < 20 * 60 * 1000;
    const opt = extractOptionNumber(rawText);
    const asksPriceQuick = /(precio|cuanto|vale|valor|sale)/i.test(rawText);

    if (lastHitsFresh) {
      if (opt && opt >= 1 && opt <= lastHits.length) {
        const selectedId = lastHits[opt - 1];
        const item = catalog.find((x) => x.id === selectedId);
        if (item) {
          const detailReply = `Dale. Opción ${opt}:\n${formatItemLine(item, opt)}\n\n¿Querés coordinar reserva o te paso otra alternativa?`;
          // If the item has an image, include it as media; otherwise send plain text.
          const imageUrl = (item as any).image ?? undefined;
          scheduleReply(detailReply, {
            ...state,
            stage: 'idle',
            last_intent: 'option_selected'
          } as any, imageUrl);
          return;
        }
      }

      if (asksPriceQuick && !opt) {
        const askWhich = `Dale. ¿De cuál opción querés el precio? (1-${Math.min(lastHits.length, 6)})`;
        scheduleReply(askWhich, {
          ...state,
          stage: 'idle',
          last_intent: 'ask_price_which'
        } as any);
        return;
      }
    }
    let reply = '';
    // Start newState from previous state so we don't drop unrelated keys
    let newState: ConvState = { ...state, stage: 'idle', lastBotAt: nowIso };
    let isFallback = false;

    // If awaiting a query from previous greeting/price intent
    if (state.stage === 'awaiting_query') {
      const hits = searchCatalog(catalog, rawText, 6);
      if (hits.length) {
        // If there is exactly one match, send an image + details directly and skip listing.
        if (hits.length === 1) {
          const item = hits[0];
          const detailReply = `Dale. Opción 1:\n${formatItemLine(item, 1)}\n\n¿Querés coordinar reserva o te paso otra alternativa?`;
          const nextState: ConvState = {
            ...state,
            stage: 'idle',
            last_intent: 'product_results_single',
            last_query: rawText,
            last_hits: [item.id],
            last_hits_at: nowIso
          };
          // Schedule reply with image if available and return early.
          const imageUrl = (item as any).image ?? undefined;
          scheduleReply(detailReply, nextState, imageUrl);
          return;
        }
        // Compose a random variant for presenting results when multiple matches are found
        const headerVariants = ['Dale. Mirá opciones 👇', 'Te paso estas opciones 👇', 'Genial, mirá lo que tengo 👇'];
        const tailVariants = [
          '¿Querés que te pase alternativas en otro rango de precio?',
          'Si me decís presupuesto y zona, te recomiendo la mejor opción.',
          'Decime presupuesto y zona y busco lo mejor para vos.'
        ];
        reply = [pickOne(headerVariants), ...hits.map((it, i) => formatItemLine(it, i + 1)), '', pickOne(tailVariants)].join('\n');
        newState.last_intent = 'product_results';
        newState.last_query = rawText;
        newState.last_hits = hits.map((it) => it.id).slice(0, 6);
        newState.last_hits_at = nowIso;
      } else {
        const noMatchVariants = [
          'No lo encontré 😕 ¿Me decís marca/modelo o para qué lo necesitás?',
          'No me aparece ese modelo. ¿Tenés presupuesto aproximado?',
          'No lo veo en el catálogo ahora. ¿Qué uso le das y rango de precio?'
        ];
        reply = pickOne(noMatchVariants);
        newState.last_intent = 'no_match';
        newState.last_query = rawText;
        isFallback = true;
      }
    } else {
      // Heuristics to infer intent
      const isGreeting = /^(hola|buenas|buen\s+dia|buen\s+tarde|buen\s+noche|hey|que\s+tal)\b/i.test(rawText);
      const asksPrice = /(precio|cuanto|vale|valor|sale)/i.test(rawText);
      const looksLikeQuery = /(ps5|play\s*5|xbox|consola|auricular|headset|monitor|notebook|silla|joystick|teclado|mouse)/i.test(rawText);

      const norm = normalize(rawText);
      const hasContent = norm.length >= 3 && /[a-z0-9]/i.test(norm);
      const stage = state.stage as ConvState['stage'];
      const shouldSearch = stage === 'awaiting_query' || looksLikeQuery || (asksPrice && hasContent) || hasContent;

      if (isGreeting) {
        const greetingVariants = [
          '¡Buenas 😄! ¿Qué estás buscando hoy?',
          '¡Hola! Decime qué necesitás y te paso opciones.',
          '¡Hola! ¿Qué andás buscando?'
        ];
        reply = pickOne(greetingVariants);
        newState.stage = 'awaiting_query';
        newState.last_intent = 'greeting';
      } else if (asksPrice) {
        const priceVariants = [
          'Dale. ¿De qué producto/modelo querés precio?',
          '¡Ok! Decime el modelo o marca y busco el precio.',
          'Decime el producto o modelo para chequear el precio.'
        ];
        reply = pickOne(priceVariants);
        newState.stage = 'awaiting_query';
        newState.last_intent = 'price_request';
      } else if (shouldSearch) {
        const hits = searchCatalog(catalog, rawText, 6);
        if (hits.length) {
          // If exactly one hit, send image + details directly and return early
          if (hits.length === 1) {
            const item = hits[0];
            const detailReply = `Dale. Opción 1:\n${formatItemLine(item, 1)}\n\n¿Querés coordinar reserva o te paso otra alternativa?`;
            const nextState: ConvState = {
              ...state,
              stage: 'idle',
              last_intent: 'product_results_single',
              last_query: rawText,
              last_hits: [item.id],
              last_hits_at: nowIso
            };
            const imageUrl = (item as any).image ?? undefined;
            scheduleReply(detailReply, nextState, imageUrl);
            return;
          }
          const headerVariants = ['Te paso opciones 👇', 'Mirá estas opciones 👇', 'Dale. Tengo esto 👇'];
          const tailVariants = [
            'Si me decís presupuesto y zona, te recomiendo la mejor opción.',
            '¿Querés que te pase alternativas en otro rango de precio?',
            'Contame presupuesto y zona para ajustar la búsqueda.'
          ];
          reply = [pickOne(headerVariants), ...hits.map((it, i) => formatItemLine(it, i + 1)), '', pickOne(tailVariants)].join('\n');
          newState.last_intent = 'product_results';
          newState.last_query = rawText;
          newState.last_hits = hits.map((it) => it.id).slice(0, 6);
          newState.last_hits_at = nowIso;
        } else {
          const noMatchVariants = [
            'No lo encontré 😕 ¿Me decís marca/modelo o para qué lo necesitás?',
            'No me aparece ese modelo. ¿Tenés presupuesto aproximado?',
            'No lo veo en el catálogo ahora. ¿Qué uso le das y rango de precio?'
          ];
          reply = pickOne(noMatchVariants);
          newState.last_intent = 'no_match';
          newState.last_query = rawText;
          newState.stage = 'awaiting_query';
          isFallback = true;
        }
      } else {
        // Fallback generic prompt
        const fallbackVariants = [
          'Dale 🙂 ¿Qué producto estabas buscando?',
          '¿Qué necesitás ver? Si me decís marca/modelo o presupuesto, te recomiendo mejor.',
          'Decime qué estás buscando y te paso opciones y precios.'
        ];
        reply = pickOne(fallbackVariants);
        newState.stage = 'awaiting_query';
        newState.last_intent = 'fallback';
        isFallback = true;
      }
    }

    // Anti-repeat: do not send the same reply (hash) within fallbackCooldownMs
    const replyHash = hashString(reply);
    const lastHash = (state as any).last_bot_reply_hash;
    const lastHashAtStr = (state as any).last_bot_reply_at;
    let skipReply = false;
    if (lastHash && lastHashAtStr && lastHash === replyHash) {
      const lastHashAt = Date.parse(lastHashAtStr);
      if (!Number.isNaN(lastHashAt) && now - lastHashAt < env.fallbackCooldownMs) {
        skipReply = true;
      }
    }

    // If skipping, do nothing (user will likely clarify soon)
    if (skipReply) {
      cleanup();
      return;
    }

    // If previous fallback was within cooldown, avoid repeating fallback and ask for a specific detail instead
    const lastFallbackAt = (state as any).last_fallback_at;
    if (isFallback && lastFallbackAt) {
      const lastFb = Date.parse(lastFallbackAt);
      if (!Number.isNaN(lastFb) && now - lastFb < env.fallbackCooldownMs) {
        // Instead of repeating, ask one clarifying question
        const clarVariants = [
          '¿Tenés alguna marca o modelo en mente?',
          '¿Cuál es tu presupuesto aproximado?',
          '¿Para qué lo vas a usar?'
        ];
        reply = pickOne(clarVariants);
        isFallback = false; // treat as different
      }
    }

    if (isFallback) {
      newState.last_fallback_at = nowIso;
    }

    scheduleReply(reply, newState);
  } catch (err) {
    console.error(err);
  }
}

webhookRouter.post('/evolution', async (req: Request, res: Response) => {
  try {
    // ✅ Auth: header OR query token (Evolution UI no permite headers)
    const headerSecret = String(req.header('x-bot-secret') ?? '');
    const queryToken = String((req.query as any)?.token ?? '');
    const secret = headerSecret || queryToken;

    if (!secret || secret !== env.webhookSecret) {
      return res.status(401).json({ ok: false });
    }

    const body: any = req.body;

    if (env.debugWebhooks || env.nodeEnv !== 'production') {
      console.log('[WEBHOOK] event =', body?.event, 'hasHeaderSecret=', !!headerSecret, 'hasQueryToken=', !!queryToken);
    }

    // ✅ Accept both Evolution variants
    const { ok: isUpsert, event } = isMessagesUpsertEvent(body);
    if (!isUpsert) {
      return res.status(200).json({ ok: true, ignored: true, event });
    }

    const instance = String(body?.instance ?? env.instanceName);
    const msg = body?.data;

    const remoteJid = String(msg?.key?.remoteJid ?? '');
    const fromMe = !!msg?.key?.fromMe;
    const msgId = String(msg?.key?.id ?? '');

    if (!remoteJid || !msgId) return res.status(200).json({ ok: true, ignored: true, reason: 'missing_jid_or_id' });
    if (remoteJid.endsWith('@g.us')) {
      return res.status(200).json({ ok: true, ignored: true, reason: 'group' });
    }
    if (remoteJid === 'status@broadcast') return res.status(200).json({ ok: true, ignored: true, reason: 'status' });

    // Always ignore messages sent by our own WhatsApp (fromMe). This prevents
    // feedback loops and avoids the bot reacting to operator replies.
    if (fromMe) {
      // When an operator replies from the same instance (fromMe = true), mark this conversation as human-only.
      try {
        const instanceName = instance;
        await setConversationRule(instanceName, remoteJid, 'HUMAN_ONLY');
      } catch (err) {
        console.error('Failed to set conversation rule on operator message', err);
      }
      return res.status(200).json({ ok: true, ignored: true, reason: 'from_me' });
    }

    // Avoid duplicate processing
    if (await seenDedupe(msgId)) {
      return res.status(200).json({ ok: true, dedupe: true });
    }
    await markDedupe(msgId, instance, remoteJid, fromMe ? 'OUT' : 'IN');

    const rawText = getText(msg);
    const text = normalize(rawText);
    if (!text) return res.status(200).json({ ok: true, ignored: true, reason: 'empty_text' });

    // Emit an event for inbound messages so the manager UI can update in real time.
    try {
      const sock = getSocket();
      if (sock) {
        sock.emit('messages.upsert', {
          instance,
          remoteJid,
          text: rawText,
          fromMe
        });
      }
    } catch (err) {
      console.error('Failed to emit inbound message event', err);
    }

    // Immediately queue the message for debounced processing. The handler will
    // decide if it should reply based on state, cooldowns and heuristics. We
    // respond to the webhook right away so Evolution doesn't retry.
    const key = `${instance}:${remoteJid}`;
    const nowMs = Date.now();
    const existing = aggregators.get(key);

    let entry: AggregatorEntry;
    if (existing) {
      if (existing.timer) clearTimeout(existing.timer);
      if (existing.sendTimer) {
        // User kept typing while we were "typing" a reply; cancel and recompute.
        clearTimeout(existing.sendTimer);
        existing.sendTimer = null;
      }
      existing.texts.push(rawText);
      existing.msgIds.push(msgId);
      // Keep only the last few to avoid unbounded growth
      if (existing.texts.length > 6) existing.texts = existing.texts.slice(-6);
      if (existing.msgIds.length > 6) existing.msgIds = existing.msgIds.slice(-6);
      existing.count += 1;
      existing.lastAt = nowMs;
      entry = existing;
    } else {
      entry = {
        key,
        instance,
        remoteJid,
        fromMe,
        msgIds: [msgId],
        texts: [rawText],
        firstAt: nowMs,
        lastAt: nowMs,
        count: 1,
        timer: null,
        sendTimer: null
      };
    }

    // If the user sent 3 messages within 3 seconds, wait a bit more and reply once.
    const fastBurst = entry.count >= 3 && entry.lastAt - entry.firstAt <= 3000;
    const extraWait = fastBurst ? randInt(2000, 4000) : 0;
    const waitMs = randInt(env.humanizerMinMs, env.humanizerMaxMs) + extraWait;

    entry.timer = setTimeout(() => {
      // We keep the entry in the map until the reply is actually sent, so a new
      // incoming message can cancel the pending reply.
      entry.timer = null;
      const aggregatedText = entry.texts.join('\n');
      const lastMsgId = entry.msgIds[entry.msgIds.length - 1] || msgId;
      handleAggregatedMessage(entry.key, entry.instance, entry.remoteJid, aggregatedText, lastMsgId);
    }, waitMs);

    aggregators.set(key, entry);

    return res.status(200).json({ ok: true, queued: true });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});