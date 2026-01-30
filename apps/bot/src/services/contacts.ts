import { pool } from './db.js';

/**
 * Represents the mode in which the bot should operate for a given
 * contact. When botMode is 'ON' the bot will respond normally.
 * When 'OFF' the bot will ignore incoming messages for that number.
 * When 'HUMAN_ONLY' the bot will ignore automatic replies and let
 * a human operator handle the conversation.
 */
export type BotMode = 'ON' | 'OFF' | 'HUMAN_ONLY';

/**
 * Look up the bot mode for a specific phone number. Returns null
 * if no rule is defined, meaning the default behaviour (ON) should
 * be used.
 *
 * @param number The phone number to query (without the @s.whatsapp.net suffix).
 */
export async function getContactRule(number: string): Promise<BotMode | null> {
  const r = await pool.query('select bot_mode from bot_contact_rules where number=$1', [number]);
  if ((r.rowCount ?? 0) === 0) return null;
  return (r.rows[0].bot_mode as BotMode) ?? null;
}

/**
 * Return a list of all contact rules. Useful for admin UIs to
 * display the current configuration. The results are ordered by
 * updated_at descending so that recently modified rules appear first.
 */
export async function listContactRules() {
  const r = await pool.query(
    'select number, bot_mode, notes, updated_at from bot_contact_rules order by updated_at desc'
  );
  return r.rows;
}

/**
 * Create or update a contact rule. If a rule already exists for
 * the given number the bot_mode and notes will be updated.
 *
 * @param number The phone number (just digits, no formatting).
 * @param botMode The desired mode for this contact.
 * @param notes Optional freeform notes about why this rule exists.
 */
export async function setContactRule(number: string, botMode: BotMode, notes?: string) {
  await pool.query(
    `insert into bot_contact_rules(number, bot_mode, notes, updated_at)
     values ($1, $2, $3, now())
     on conflict (number)
     do update set bot_mode=excluded.bot_mode, notes=excluded.notes, updated_at=excluded.updated_at`,
    [number, botMode, notes ?? null]
  );
}

/**
 * Delete a contact rule for a given number. Deleting a rule
 * reverts the contact back to the default behaviour (ON).
 *
 * @param number The phone number to delete.
 */
export async function deleteContactRule(number: string) {
  await pool.query('delete from bot_contact_rules where number=$1', [number]);
}