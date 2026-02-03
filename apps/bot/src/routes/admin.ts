import { Router } from 'express';
import { env } from '../lib/env.js';
import { evolutionCreateInstance, evolutionConnect } from '../services/evolution.js';
import { pool } from '../services/db.js';
import { listContactRules, setContactRule, deleteContactRule } from '../services/contacts.js';
import {
  listConversationRules,
  setConversationRule,
  deleteConversationRule,
  listConversationTags,
  addConversationTag,
  removeConversationTag,
  listConversationNotes,
  addConversationNote,
  listQuickReplies,
  addQuickReply,
  deleteQuickReply
} from '../services/rules.js';
import {
  getIntelligenceSettings,
  updateIntelligenceSettings,
  listFaq,
  createFaq,
  deleteFaq,
  listPlaybooks,
  createPlaybook,
  deletePlaybook,
  listExamples,
  createExample,
  deleteExample,
  listDecisions
} from '../services/intelligence.js';

export const adminRouter = Router();

function requireAdmin(req: any, res: any, next: any) {
  const token = String(req.header('x-admin-token') ?? '');
  if (!token || token !== env.adminToken) {
    return res.status(401).json({ ok: false });
  }
  return next();
}

adminRouter.use(requireAdmin);

adminRouter.post('/bootstrap', async (req, res) => {
  if (!env.publicUrl) {
    return res.status(400).json({ ok: false, message: 'BOT_PUBLIC_URL not set' });
  }
  const instanceName = String(req.body?.instanceName ?? env.instanceName);
  try {
    const r = await evolutionCreateInstance({
      instanceName,
      withQr: true,
      webhookUrl: `${env.publicUrl}/webhooks/evolution`,
      webhookSecret: env.webhookSecret
    });
    return res.json({ ok: true, result: r });
  } catch (e: any) {
    // If instance name already exists, Evolution returns 403. We surface the error but keep guidance.
    return res.status(400).json({ ok: false, error: String(e?.message ?? e) });
  }
});

adminRouter.get('/qr', async (req, res) => {
  const instanceName = String(req.query.instanceName ?? env.instanceName);
  try {
    const r = await evolutionConnect(instanceName);
    return res.json({ ok: true, result: r });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message ?? e) });
  }
});

/**
 * Lightweight "training" helpers (v1): expose recent conversation state
 * so you can build a UI without touching the bot code every time.
 */
adminRouter.get('/conversations', async (req, res) => {
  const instance = String(req.query.instance ?? env.instanceName);
  const limitRaw = Number(req.query.limit ?? 50);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
  try {
    const r = await pool.query(
      'select remote_jid, state, updated_at from bot_conversations where instance=$1 order by updated_at desc limit $2',
      [instance, limit]
    );
    return res.json({ ok: true, instance, conversations: r.rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

adminRouter.get('/conversation', async (req, res) => {
  const instance = String(req.query.instance ?? env.instanceName);
  const remoteJid = String(req.query.remoteJid ?? '');
  if (!remoteJid) return res.status(400).json({ ok: false, message: 'remoteJid required' });
  try {
    const r = await pool.query('select remote_jid, state, updated_at from bot_conversations where instance=$1 and remote_jid=$2', [instance, remoteJid]);
    if ((r.rowCount ?? 0) === 0) return res.status(404).json({ ok: false, message: 'not found' });
    return res.json({ ok: true, instance, conversation: r.rows[0] });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

/**
 * Manage per-number bot modes (ON, OFF, HUMAN_ONLY). These endpoints
 * allow an administrator to list, create/update and delete contact rules
 * via a simple REST API. The values are persisted in the
 * bot_contact_rules table.
 */

// List all contact rules
adminRouter.get('/private-numbers', async (_req, res) => {
  try {
    const rules = await listContactRules();
    return res.json({ ok: true, rules });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// Create or update a contact rule. Expects a JSON body with
// { number: string, botMode: 'ON' | 'OFF' | 'HUMAN_ONLY', notes?: string }
adminRouter.post('/private-numbers', async (req, res) => {
  const number = String(req.body?.number ?? '').trim();
  const botMode = String(req.body?.botMode ?? '').trim().toUpperCase();
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : undefined;
  if (!number || !botMode) {
    return res.status(400).json({ ok: false, message: 'number and botMode required' });
  }
  if (!['ON', 'OFF', 'HUMAN_ONLY'].includes(botMode)) {
    return res.status(400).json({ ok: false, message: 'botMode must be ON, OFF or HUMAN_ONLY' });
  }
  try {
    await setContactRule(number, botMode as any, notes);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// Delete a contact rule
adminRouter.delete('/private-numbers/:number', async (req, res) => {
  const number = String(req.params.number ?? '').trim();
  if (!number) {
    return res.status(400).json({ ok: false, message: 'number required' });
  }
  try {
    await deleteContactRule(number);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

/**
 * Conversation-level bot rules (instance + remoteJid). These endpoints allow
 * admins to control the bot mode for a specific conversation instead of a
 * global number. They mirror the private-numbers endpoints but operate on
 * the bot_conversation_rules table. When specifying instance, if omitted
 * the default env.instanceName is used.
 */

// List all conversation rules
adminRouter.get('/conversation-rules', async (req, res) => {
  try {
    const rules = await listConversationRules();
    return res.json({ ok: true, rules });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// Create or update a conversation rule. Body: { instance?: string, remoteJid: string, botMode: 'ON'|'OFF'|'HUMAN_ONLY', notes?: string }
adminRouter.post('/conversation-rules', async (req, res) => {
  const instance = String(req.body?.instance ?? env.instanceName);
  const remoteJid = String(req.body?.remoteJid ?? '').trim();
  const botMode = String(req.body?.botMode ?? '').trim().toUpperCase();
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : undefined;
  if (!remoteJid || !botMode) {
    return res.status(400).json({ ok: false, message: 'remoteJid and botMode required' });
  }
  if (!['ON', 'OFF', 'HUMAN_ONLY'].includes(botMode)) {
    return res.status(400).json({ ok: false, message: 'botMode must be ON, OFF or HUMAN_ONLY' });
  }
  try {
    await setConversationRule(instance, remoteJid, botMode as any, notes);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// Delete a conversation rule
adminRouter.delete('/conversation-rules/:instance/:remoteJid', async (req, res) => {
  const instance = String(req.params.instance ?? env.instanceName);
  const remoteJid = String(req.params.remoteJid ?? '').trim();
  if (!remoteJid) {
    return res.status(400).json({ ok: false, message: 'remoteJid required' });
  }
  try {
    await deleteConversationRule(instance, remoteJid);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

/**
 * Conversation tags and notes. These endpoints allow attaching tags and notes
 * to conversations to aid operators in triaging and categorising chats.
 */

// List tags for a conversation
adminRouter.get('/conversation/:remoteJid/tags', async (req, res) => {
  const instance = String(req.query.instance ?? env.instanceName);
  const remoteJid = String(req.params.remoteJid ?? '').trim();
  if (!remoteJid) return res.status(400).json({ ok: false, message: 'remoteJid required' });
  try {
    const tags = await listConversationTags(instance, remoteJid);
    return res.json({ ok: true, instance, remoteJid, tags });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// Add a tag to a conversation. Body: { tag: string, instance?: string }
adminRouter.post('/conversation/:remoteJid/tags', async (req, res) => {
  const instance = String(req.body?.instance ?? req.query.instance ?? env.instanceName);
  const remoteJid = String(req.params.remoteJid ?? '').trim();
  const tag = String(req.body?.tag ?? '').trim();
  if (!remoteJid || !tag) {
    return res.status(400).json({ ok: false, message: 'remoteJid and tag required' });
  }
  try {
    await addConversationTag(instance, remoteJid, tag);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// Remove a tag from a conversation
adminRouter.delete('/conversation/:remoteJid/tags/:tag', async (req, res) => {
  const instance = String(req.query.instance ?? env.instanceName);
  const remoteJid = String(req.params.remoteJid ?? '').trim();
  const tag = String(req.params.tag ?? '').trim();
  if (!remoteJid || !tag) {
    return res.status(400).json({ ok: false, message: 'remoteJid and tag required' });
  }
  try {
    await removeConversationTag(instance, remoteJid, tag);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// List notes for a conversation
adminRouter.get('/conversation/:remoteJid/notes', async (req, res) => {
  const instance = String(req.query.instance ?? env.instanceName);
  const remoteJid = String(req.params.remoteJid ?? '').trim();
  if (!remoteJid) return res.status(400).json({ ok: false, message: 'remoteJid required' });
  try {
    const notes = await listConversationNotes(instance, remoteJid);
    return res.json({ ok: true, instance, remoteJid, notes });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// Add a note to a conversation. Body: { note: string, instance?: string }
adminRouter.post('/conversation/:remoteJid/notes', async (req, res) => {
  const instance = String(req.body?.instance ?? req.query.instance ?? env.instanceName);
  const remoteJid = String(req.params.remoteJid ?? '').trim();
  const note = String(req.body?.note ?? '').trim();
  if (!remoteJid || !note) {
    return res.status(400).json({ ok: false, message: 'remoteJid and note required' });
  }
  try {
    await addConversationNote(instance, remoteJid, note);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

/**
 * Quick replies management. Allows defining canned responses that operators can reuse.
 */

// List quick replies
adminRouter.get('/quick-replies', async (_req, res) => {
  try {
    const replies = await listQuickReplies();
    return res.json({ ok: true, replies });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// Add or update a quick reply. Body: { slug: string, content: string }
adminRouter.post('/quick-replies', async (req, res) => {
  const slug = String(req.body?.slug ?? '').trim();
  const content = String(req.body?.content ?? '').trim();
  if (!slug || !content) {
    return res.status(400).json({ ok: false, message: 'slug and content required' });
  }
  try {
    await addQuickReply(slug, content);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// Delete a quick reply by id
adminRouter.delete('/quick-replies/:id', async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isFinite(idNum)) {
    return res.status(400).json({ ok: false, message: 'valid id required' });
  }
  try {
    await deleteQuickReply(idNum);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

/**
 * Basic metrics endpoint. Returns simple counts to help measure usage and ROI.
 */
adminRouter.get('/metrics', async (req, res) => {
  const instance = String(req.query.instance ?? env.instanceName);
  try {
    // total conversations
    const conv = await pool.query('select count(*) from bot_conversations where instance=$1', [instance]);
    const totalConversations = Number(conv.rows[0].count ?? 0);
    // leads (defined as conversations where last_intent indicates interest)
    const leads = await pool.query(
      `select count(*) from bot_conversations
       where instance=$1
       and (state->>'last_intent') in ('product_results','price_request','option_selected')`,
      [instance]
    );
    const totalLeads = Number(leads.rows[0].count ?? 0);
    // conversations handed to human (bot_mode not ON)
    const handed = await pool.query(
      `select count(*) from bot_conversation_rules where instance=$1 and bot_mode <> 'ON'`,
      [instance]
    );
    const handedToHuman = Number(handed.rows[0].count ?? 0);
    return res.json({ ok: true, instance, metrics: { totalConversations, totalLeads, handedToHuman } });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

/**
 * Intelligence configuration (Settings, FAQ, Playbooks, Examples, Decisions)
 */
adminRouter.get('/intelligence/settings', async (_req, res) => {
  try {
    const settings = await getIntelligenceSettings();
    return res.json({ ok: true, settings });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

adminRouter.put('/intelligence/settings', async (req, res) => {
  try {
    const settings = await updateIntelligenceSettings(req.body ?? {});
    return res.json({ ok: true, settings });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

adminRouter.get('/intelligence/faqs', async (_req, res) => {
  try {
    const faqs = await listFaq();
    return res.json({ ok: true, faqs });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

adminRouter.post('/intelligence/faqs', async (req, res) => {
  try {
    const faq = await createFaq({
      title: req.body?.title,
      triggers: req.body?.triggers ?? [],
      answer: req.body?.answer ?? '',
      enabled: req.body?.enabled
    });
    return res.json({ ok: true, faq });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

adminRouter.delete('/intelligence/faqs/:id', async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isFinite(idNum)) return res.status(400).json({ ok: false, message: 'valid id required' });
  try {
    await deleteFaq(idNum);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

adminRouter.get('/intelligence/playbooks', async (_req, res) => {
  try {
    const playbooks = await listPlaybooks();
    return res.json({ ok: true, playbooks });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

adminRouter.post('/intelligence/playbooks', async (req, res) => {
  try {
    const playbook = await createPlaybook({
      intent: String(req.body?.intent ?? ''),
      triggers: req.body?.triggers ?? [],
      template: String(req.body?.template ?? ''),
      enabled: req.body?.enabled
    });
    return res.json({ ok: true, playbook });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

adminRouter.delete('/intelligence/playbooks/:id', async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isFinite(idNum)) return res.status(400).json({ ok: false, message: 'valid id required' });
  try {
    await deletePlaybook(idNum);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

adminRouter.get('/intelligence/examples', async (_req, res) => {
  try {
    const examples = await listExamples();
    return res.json({ ok: true, examples });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

adminRouter.post('/intelligence/examples', async (req, res) => {
  try {
    const example = await createExample({
      intent: String(req.body?.intent ?? ''),
      user_text: String(req.body?.user_text ?? ''),
      ideal_answer: String(req.body?.ideal_answer ?? ''),
      notes: req.body?.notes
    });
    return res.json({ ok: true, example });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

adminRouter.delete('/intelligence/examples/:id', async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isFinite(idNum)) return res.status(400).json({ ok: false, message: 'valid id required' });
  try {
    await deleteExample(idNum);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

adminRouter.get('/intelligence/decisions', async (req, res) => {
  const limitRaw = Number(req.query.limit ?? 100);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;
  try {
    const decisions = await listDecisions(limit);
    return res.json({ ok: true, decisions });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});
