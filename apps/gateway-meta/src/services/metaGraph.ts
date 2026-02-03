import fetch from 'node-fetch';
import crypto from 'node:crypto';
import { env } from '../lib/env.js';

export function validateSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!env.validateSignature) return true;
  if (!signatureHeader) return false;

  // format: "sha256=<hex>"
  const m = signatureHeader.match(/^sha256=(.+)$/i);
  if (!m) return false;
  const expected = m[1];

  const hmac = crypto.createHmac('sha256', env.appSecret).update(rawBody).digest('hex');

  // constant-time compare
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(hmac, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function graphPost(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`https://graph.facebook.com/${env.graphVersion}/${path.replace(/^\//, '')}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', env.pageAccessToken);

  const res = await fetch(url.toString(), { method: 'POST' });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const msg = json?.error?.message ?? `Graph POST failed (${res.status})`;
    const code = json?.error?.code;
    throw new Error(`${msg}${code ? ` (code ${code})` : ''}`);
  }
  return json;
}

async function graphPostJson(path: string, body: any): Promise<any> {
  const url = new URL(`https://graph.facebook.com/${env.graphVersion}/${path.replace(/^\//, '')}`);
  url.searchParams.set('access_token', env.pageAccessToken);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const msg = json?.error?.message ?? `Graph POST failed (${res.status})`;
    const code = json?.error?.code;
    throw new Error(`${msg}${code ? ` (code ${code})` : ''}`);
  }
  return json;
}

export async function replyToCommentPublic(commentId: string, message: string): Promise<void> {
  await graphPost(`/${commentId}/replies`, { message });
}

/**
 * Sends a private reply to a comment using the Send API. This is the cleanest
 * MVP path because it works for both FB Page comments and IG comments.
 */
export async function privateReplyToComment(commentId: string, message: string): Promise<void> {
  await graphPostJson(`/${env.pageId}/messages`, {
    messaging_type: 'RESPONSE',
    recipient: { comment_id: commentId },
    message: { text: message }
  });
}
