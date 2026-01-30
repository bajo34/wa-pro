import { pool } from './db.js';
import type { BotMode } from './contacts.js';

/**
 * Retrieve the bot_mode for a specific conversation (instance + remoteJid).
 * Returns null if no rule is defined.
 */
export async function getConversationRule(instance: string, remoteJid: string): Promise<BotMode | null> {
  const r = await pool.query(
    'select bot_mode from bot_conversation_rules where instance=$1 and remote_jid=$2',
    [instance, remoteJid]
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return (r.rows[0].bot_mode as BotMode) ?? null;
}

/**
 * Create or update a rule for a conversation. If a rule exists it will be updated.
 */
export async function setConversationRule(instance: string, remoteJid: string, botMode: BotMode, notes?: string) {
  await pool.query(
    `insert into bot_conversation_rules(instance, remote_jid, bot_mode, notes, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (instance, remote_jid)
     do update set bot_mode=excluded.bot_mode, notes=excluded.notes, updated_at=excluded.updated_at`,
    [instance, remoteJid, botMode, notes ?? null]
  );
}

/**
 * Remove a conversation rule so that it falls back to the default behaviour or contact rule.
 */
export async function deleteConversationRule(instance: string, remoteJid: string) {
  await pool.query('delete from bot_conversation_rules where instance=$1 and remote_jid=$2', [instance, remoteJid]);
}

/**
 * List all conversation rules ordered by most recent updates.
 */
export async function listConversationRules() {
  const r = await pool.query(
    'select instance, remote_jid, bot_mode, notes, updated_at from bot_conversation_rules order by updated_at desc'
  );
  return r.rows;
}

/**
 * List all tags for a conversation.
 */
export async function listConversationTags(instance: string, remoteJid: string) {
  const r = await pool.query(
    'select tag, created_at from bot_conversation_tags where instance=$1 and remote_jid=$2 order by created_at asc',
    [instance, remoteJid]
  );
  return r.rows;
}

/**
 * Add a tag to a conversation. Duplicate tags are ignored via the primary key.
 */
export async function addConversationTag(instance: string, remoteJid: string, tag: string) {
  await pool.query(
    'insert into bot_conversation_tags(instance, remote_jid, tag) values ($1,$2,$3) on conflict do nothing',
    [instance, remoteJid, tag]
  );
}

/**
 * Remove a tag from a conversation.
 */
export async function removeConversationTag(instance: string, remoteJid: string, tag: string) {
  await pool.query(
    'delete from bot_conversation_tags where instance=$1 and remote_jid=$2 and tag=$3',
    [instance, remoteJid, tag]
  );
}

/**
 * List notes for a conversation.
 */
export async function listConversationNotes(instance: string, remoteJid: string) {
  const r = await pool.query(
    'select note, created_at from bot_conversation_notes where instance=$1 and remote_jid=$2 order by created_at asc',
    [instance, remoteJid]
  );
  return r.rows;
}

/**
 * Append a note to a conversation.
 */
export async function addConversationNote(instance: string, remoteJid: string, note: string) {
  await pool.query(
    'insert into bot_conversation_notes(instance, remote_jid, note, created_at) values ($1,$2,$3, now())',
    [instance, remoteJid, note]
  );
}

/**
 * Retrieve all quick replies.
 */
export async function listQuickReplies() {
  const r = await pool.query('select id, slug, content, created_at from bot_quick_replies order by created_at asc');
  return r.rows;
}

/**
 * Add a new quick reply with a unique slug.
 */
export async function addQuickReply(slug: string, content: string) {
  await pool.query(
    'insert into bot_quick_replies(slug, content) values ($1,$2) on conflict (slug) do update set content=excluded.content',
    [slug, content]
  );
}

/**
 * Delete a quick reply by id.
 */
export async function deleteQuickReply(id: number) {
  await pool.query('delete from bot_quick_replies where id=$1', [id]);
}