import type { Request, Response } from 'express';
import { env } from '../lib/env.js';
import { validateSignature, replyToCommentPublic, privateReplyToComment } from '../services/metaGraph.js';
import { getMappedVehicleId } from '../services/publicationMap.js';
import { getVehicleById, getVehicleBySlug, buildVehicleUrl, formatPrice, vehicleTitle } from '../services/vehicles.js';

type Platform = 'IG' | 'FB';

type IncomingCommentEvent = {
  platform: Platform;
  commentId: string;
  mediaId?: string;
  text: string;
};

const seen = new Map<string, number>();
const DEDUP_TTL_MS = 5 * 60 * 1000;

function dedup(key: string): boolean {
  const now = Date.now();
  // cleanup small
  for (const [k, t] of seen) {
    if (now - t > DEDUP_TTL_MS) seen.delete(k);
  }
  if (seen.has(key)) return true;
  seen.set(key, now);
  return false;
}

function containsKeyword(text: string): boolean {
  const t = (text ?? '').toLowerCase();
  return env.keywords.some((k) => t.includes(k));
}

function guessSlugFromText(text: string): string | null {
  // Looks for URLs like https://tusitio.com/autos/<slug> or /vehiculos/<slug>
  const m = text.match(/\b(?:autos|vehiculos|vehículos)\/([a-z0-9-_]{3,80})\b/i);
  return m?.[1] ?? null;
}

async function resolveVehicle(platform: Platform, mediaId: string | undefined, commentText: string) {
  if (!mediaId) {
    const slug = guessSlugFromText(commentText);
    if (slug) return await getVehicleBySlug(slug);
    return null;
  }

  // 1) DB mapping
  const mapped = await getMappedVehicleId(platform, mediaId).catch(() => null);
  if (mapped) {
    const v = await getVehicleById(mapped).catch(() => null);
    if (v) return v;
  }

  // 2) env mapping (JSON) optional
  const raw = process.env.META_PUBLICATION_MAP_JSON;
  if (raw) {
    try {
      const obj = JSON.parse(raw) as Record<string, string>;
      const vehicleId = obj[mediaId];
      if (vehicleId) {
        const v = await getVehicleById(vehicleId).catch(() => null);
        if (v) return v;
      }
    } catch {
      // ignore
    }
  }

  // 3) slug in comment itself
  const slug = guessSlugFromText(commentText);
  if (slug) return await getVehicleBySlug(slug).catch(() => null);

  return null;
}

function buildDmMessage(v: any): string {
  const title = vehicleTitle(v);
  const price = formatPrice(v.price, v.currency);
  const url = buildVehicleUrl(v);

  const lines = [
    `${title}`,
    `💰 ${price}`,
    url ? `🔗 ${url}` : null,
    '',
    '¿Querés financiación o tomar tu usado en parte de pago?'
  ].filter(Boolean);

  return lines.join('\n');
}

function extractCommentEvents(body: any): IncomingCommentEvent[] {
  const out: IncomingCommentEvent[] = [];
  if (!body || !Array.isArray(body.entry)) return out;

  for (const entry of body.entry) {
    // IG comments usually arrive in entry.changes
    if (Array.isArray(entry.changes)) {
      for (const ch of entry.changes) {
        const field = String(ch.field ?? '');
        const val = ch.value ?? {};

        // Instagram Graph API commonly uses field: "comments" or "mentions" depending on subscriptions.
        if (field.includes('comment')) {
          const commentId = String(val.id ?? val.comment_id ?? '');
          const mediaId = String(val.media?.id ?? val.media_id ?? val.media?.media_id ?? '');
          const text = String(val.text ?? val.message ?? '');
          if (commentId && text) {
            out.push({ platform: 'IG', commentId, mediaId: mediaId || undefined, text });
          }
        }
      }
    }

    // FB Page feed changes can also be here; structure varies. Keep minimal.
    if (Array.isArray(entry.changes)) {
      for (const ch of entry.changes) {
        const field = String(ch.field ?? '');
        const val = ch.value ?? {};
        if (field === 'feed') {
          // comment on page post
          if (val.item === 'comment' && val.verb === 'add') {
            const commentId = String(val.comment_id ?? val.id ?? '');
            const postId = String(val.post_id ?? val.parent_id ?? '');
            const text = String(val.message ?? '');
            if (commentId && text) {
              out.push({ platform: 'FB', commentId, mediaId: postId || undefined, text });
            }
          }
        }
      }
    }
  }
  return out;
}

export async function metaWebhookVerify(req: Request, res: Response) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.verifyToken) {
    return res.status(200).send(String(challenge ?? ''));
  }
  return res.status(403).send('Forbidden');
}

export async function metaWebhookReceiver(req: Request, res: Response) {
  // Signature
  const rawBody: Buffer | undefined = (req as any).rawBody;
  if (env.validateSignature) {
    const sig = req.headers['x-hub-signature-256'] as string | undefined;
    if (!rawBody || !validateSignature(rawBody, sig)) {
      return res.status(401).send('Invalid signature');
    }
  }

  // Ack ASAP
  res.status(200).send('OK');

  const events = extractCommentEvents(req.body);
  for (const ev of events) {
    const key = `${ev.platform}:${ev.commentId}`;
    if (dedup(key)) continue;
    if (!containsKeyword(ev.text)) continue;

    try {
      // Public reply (best effort; not all platforms support this edge)
      try {
        await replyToCommentPublic(ev.commentId, 'Te mando la info por DM ✅');
      } catch {
        // ignore
      }

      const vehicle = await resolveVehicle(ev.platform, ev.mediaId, ev.text);
      if (vehicle) {
        await privateReplyToComment(ev.commentId, buildDmMessage(vehicle));
      } else {
        await privateReplyToComment(
          ev.commentId,
          '¡Hola! 👋 Para pasarte el precio exacto, decime cuál auto es (o mandame captura del post) y te paso toda la info.'
        );
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('meta comment handler error', { err, ev });
    }
  }
}
