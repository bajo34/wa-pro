import { pool } from './db.js';

export type ConvState = {
  /** ISO timestamp of the last time the bot replied */
  lastBotAt?: string;
  /** Stage of the conversation: idle (no pending query) or awaiting_query (waiting for user to specify a product) */
  stage?: 'idle' | 'awaiting_query';
  /** Last detected intent (greeting, price_request, product_results, no_match, fallback, etc.) */
  last_intent?: string;
  /** Last user query text */
  last_query?: string;
  /** ISO timestamp when a fallback reply was last sent */
  last_fallback_at?: string;
  /** Hash of the last message sent by the bot */
  last_bot_reply_hash?: string;
  /** ISO timestamp when the last message was sent by the bot */
  last_bot_reply_at?: string;
  /** Last product option ids shown to the user (for quick follow-ups like "la 2") */
  last_hits?: string[];
  /** ISO timestamp when last_hits were stored */
  last_hits_at?: string;
};

export async function getState(instance: string, remoteJid: string): Promise<ConvState> {
  const r = await pool.query(
    'select state from bot_conversations where instance=$1 and remote_jid=$2',
    [instance, remoteJid]
  );
  if ((r.rowCount ?? 0) === 0) return {};
  return r.rows[0].state as ConvState;
}

export async function setState(instance: string, remoteJid: string, state: ConvState) {
  await pool.query(
    `insert into bot_conversations(instance, remote_jid, state, updated_at)
     values ($1,$2,$3,now())
     on conflict (instance, remote_jid)
     do update set state=excluded.state, updated_at=excluded.updated_at`,
    [instance, remoteJid, state]
  );
}

export async function markDedupe(id: string, instance: string, remoteJid: string, direction: string) {
  await pool.query(
    'insert into bot_messages_dedupe(id, instance, remote_jid, direction) values ($1,$2,$3,$4) on conflict do nothing',
    [id, instance, remoteJid, direction]
  );
}

export async function seenDedupe(id: string) {
  const r = await pool.query('select 1 from bot_messages_dedupe where id=$1', [id]);
  return (r.rowCount ?? 0) > 0;
}
