import { pool } from './db.js';

type Settings = Record<string, any>;

function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

function textMatchesTriggers(text: string, triggers: string[]): boolean {
  const t = normalize(text);
  if (!t || !triggers?.length) return false;
  return triggers.some((raw) => {
    const trig = normalize(raw);
    if (!trig) return false;
    // word boundary-ish: allow simple contains to support spanish variations
    return t.includes(trig);
  });
}

// ---- Settings ----
export async function getIntelligenceSettings(): Promise<Settings> {
  const r = await pool.query('select value from bot_intelligence_settings where id=1');
  return (r.rows?.[0]?.value as Settings) || {};
}

export async function updateIntelligenceSettings(value: Settings): Promise<Settings> {
  const r = await pool.query(
    'insert into bot_intelligence_settings (id, value, updated_at) values (1, $1::jsonb, now())\n' +
      'on conflict (id) do update set value=excluded.value, updated_at=now()\n' +
      'returning value',
    [JSON.stringify(value ?? {})]
  );
  return r.rows[0].value as Settings;
}

// ---- FAQ ----
export async function listFaq(): Promise<any[]> {
  const r = await pool.query('select * from bot_faq order by id desc');
  return r.rows;
}

export async function createFaq(input: { title?: string; triggers: string[]; answer: string; enabled?: boolean }): Promise<any> {
  const r = await pool.query(
    'insert into bot_faq (title, triggers, answer, enabled) values ($1, $2, $3, $4) returning *',
    [input.title ?? null, input.triggers ?? [], input.answer, input.enabled ?? true]
  );
  return r.rows[0];
}

export async function deleteFaq(id: number): Promise<void> {
  await pool.query('delete from bot_faq where id=$1', [id]);
}

// ---- Playbooks ----
export async function listPlaybooks(): Promise<any[]> {
  const r = await pool.query('select * from bot_playbooks order by id desc');
  return r.rows;
}

export async function createPlaybook(input: {
  intent: string;
  triggers: string[];
  template: string;
  enabled?: boolean;
}): Promise<any> {
  const r = await pool.query(
    'insert into bot_playbooks (intent, triggers, template, enabled) values ($1, $2, $3, $4) returning *',
    [input.intent, input.triggers ?? [], input.template, input.enabled ?? true]
  );
  return r.rows[0];
}

export async function deletePlaybook(id: number): Promise<void> {
  await pool.query('delete from bot_playbooks where id=$1', [id]);
}

// ---- Examples ----
export async function listExamples(): Promise<any[]> {
  const r = await pool.query('select * from bot_examples order by id desc');
  return r.rows;
}

export async function createExample(input: {
  intent: string;
  user_text: string;
  ideal_answer: string;
  notes?: string;
}): Promise<any> {
  const r = await pool.query(
    'insert into bot_examples (intent, user_text, ideal_answer, notes) values ($1, $2, $3, $4) returning *',
    [input.intent, input.user_text, input.ideal_answer, input.notes ?? null]
  );
  return r.rows[0];
}

export async function deleteExample(id: number): Promise<void> {
  await pool.query('delete from bot_examples where id=$1', [id]);
}

// ---- Decisions ----
export async function listDecisions(limit = 100): Promise<any[]> {
  const r = await pool.query('select * from bot_decisions order by id desc limit $1', [limit]);
  return r.rows;
}

export async function logDecision(input: {
  instance: string;
  remoteJid: string;
  intent?: string;
  confidence?: number;
  data?: any;
}): Promise<void> {
  await pool.query(
    'insert into bot_decisions (instance, remote_jid, intent, confidence, data) values ($1, $2, $3, $4, $5::jsonb)',
    [input.instance, input.remoteJid, input.intent ?? null, input.confidence ?? null, JSON.stringify(input.data ?? {})]
  );
}

// ---- Matching ----
const cache = {
  at: 0,
  ttlMs: 15_000,
  faqs: [] as any[],
  playbooks: [] as any[]
};

async function refreshCacheIfNeeded() {
  const now = Date.now();
  if (now - cache.at < cache.ttlMs && (cache.faqs.length || cache.playbooks.length)) return;
  const [faqs, playbooks] = await Promise.all([
    pool.query('select * from bot_faq where enabled=true order by id desc'),
    pool.query('select * from bot_playbooks where enabled=true order by id desc')
  ]);
  cache.faqs = faqs.rows;
  cache.playbooks = playbooks.rows;
  cache.at = now;
}

export async function matchFaq(text: string): Promise<any | null> {
  await refreshCacheIfNeeded();
  for (const row of cache.faqs) {
    if (textMatchesTriggers(text, row.triggers || [])) return row;
  }
  return null;
}

export async function matchPlaybook(text: string): Promise<any | null> {
  await refreshCacheIfNeeded();
  for (const row of cache.playbooks) {
    if (textMatchesTriggers(text, row.triggers || [])) return row;
  }
  return null;
}

export function renderTemplate(template: string, ctx: Record<string, any>): string {
  // Very small mustache-like replacement: {key}
  return String(template || '').replace(/\{\s*([a-zA-Z0-9_.-]+)\s*\}/g, (_, key) => {
    const parts = String(key).split('.');
    let v: any = ctx;
    for (const p of parts) v = v?.[p];
    if (v === undefined || v === null) return '';
    return String(v);
  });
}
