import { Router } from 'express';
import fetch from 'node-fetch';
import { env } from '../lib/env.js';

/**
 * Proxy endpoints for bot "private numbers" (contact rules).
 * This keeps BOT_ADMIN_TOKEN and bot admin endpoints out of the frontend.
 */
export const privateNumbersRouter = Router();

function requireBotAdminConfig(res: any): boolean {
  if (!env.botApiUrl || !env.botAdminToken) {
    res.status(400).json({ ok: false, message: 'BOT_API_URL and BOT_ADMIN_TOKEN required' });
    return false;
  }
  return true;
}

privateNumbersRouter.get('/', async (_req, res) => {
  if (!requireBotAdminConfig(res)) return;
  const r = await fetch(`${env.botApiUrl}/admin/private-numbers`, {
    headers: { 'x-admin-token': env.botAdminToken }
  });
  const data = await r.json().catch(() => ({}));
  res.status(r.status).json(data);
});

privateNumbersRouter.post('/', async (req, res) => {
  if (!requireBotAdminConfig(res)) return;
  const r = await fetch(`${env.botApiUrl}/admin/private-numbers`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': env.botAdminToken
    },
    body: JSON.stringify(req.body ?? {})
  });
  const data = await r.json().catch(() => ({}));
  res.status(r.status).json(data);
});

privateNumbersRouter.delete('/:number', async (req, res) => {
  if (!requireBotAdminConfig(res)) return;
  const number = String(req.params.number ?? '').trim();
  const r = await fetch(`${env.botApiUrl}/admin/private-numbers/${encodeURIComponent(number)}`, {
    method: 'DELETE',
    headers: { 'x-admin-token': env.botAdminToken }
  });
  const data = await r.json().catch(() => ({}));
  res.status(r.status).json(data);
});
