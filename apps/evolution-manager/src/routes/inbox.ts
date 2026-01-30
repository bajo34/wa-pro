import { Router } from 'express';
import { pool } from '../services/db.js';
import { env } from '../lib/env.js';

/**
 * Router for inbox operations. This exposes endpoints for listing active
 * conversations, reading their messages and sending replies. A minimal
 * database-backed implementation is provided; callers must provide a
 * `x-tenant-id` header to scope queries to the correct company.
 */
export const inboxRouter = Router();

// List the most recent open conversations for the tenant. Only open
// conversations are shown; closed conversations can be retrieved via
// additional filters in the future.
inboxRouter.get('/', async (req, res, next) => {
  const tenantId = req.header('x-tenant-id');
  if (!tenantId) return res.status(400).json({ error: 'missing x-tenant-id header' });
  try {
    const { rows } = await pool.query(
      `select id, remote_jid, status, assigned_user_id, created_at, updated_at
       from conversations
       where tenant_id = $1 and status = 'open'
       order by updated_at desc
       limit 100`,
      [tenantId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Retrieve all messages for a specific conversation. Messages are ordered by
// creation time ascending. Returns 404 if the conversation does not
// belong to the provided tenant.
inboxRouter.get('/:id/messages', async (req, res, next) => {
  const tenantId = req.header('x-tenant-id');
  const id = req.params.id;
  if (!tenantId) return res.status(400).json({ error: 'missing x-tenant-id header' });
  try {
    // Verify the conversation exists and belongs to the tenant
    const convo = await pool.query('select id from conversations where id = $1 and tenant_id = $2', [id, tenantId]);
    if (convo.rowCount === 0) return res.status(404).json({ error: 'conversation not found' });
    const { rows } = await pool.query(
      `select id, sender_type, text, image_url, created_at
       from messages
       where conversation_id = $1
       order by created_at asc`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Retrieve details for a specific conversation including any stored notes. This
// endpoint exposes metadata about the conversation such as remote_jid,
// status, assignment and notes. Use `/api/inbox/:id/messages` to fetch the
// full message history.
inboxRouter.get('/:id/details', async (req, res, next) => {
  const tenantId = req.header('x-tenant-id');
  const id = req.params.id;
  if (!tenantId) return res.status(400).json({ error: 'missing x-tenant-id header' });
  try {
    const { rows } = await pool.query(
      `select id, remote_jid, status, assigned_user_id, notes
       from conversations
       where id = $1 and tenant_id = $2`,
      [id, tenantId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'conversation not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Update the notes for a specific conversation. This allows agents to store
// internal commentary or information about a contact. The request body must
// include a `notes` field containing the updated notes. The conversation
// must belong to the provided tenant.
inboxRouter.put('/:id/notes', async (req, res, next) => {
  const tenantId = req.header('x-tenant-id');
  const id = req.params.id;
  if (!tenantId) return res.status(400).json({ error: 'missing x-tenant-id header' });
  const { notes } = req.body || {};
  if (typeof notes !== 'string') {
    return res.status(400).json({ error: 'notes must be a string' });
  }
  try {
    const result = await pool.query(
      `update conversations
         set notes = $1, updated_at = now()
         where id = $2 and tenant_id = $3
         returning id`,
      [notes, id, tenantId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'conversation not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Send a reply in a conversation. Accepts either `text` or `imageUrl` with an
// optional `caption`. The message is recorded in the database with
// sender_type='agent'. For production, this should also forward the message
// to Evolution via its API; this skeleton does not perform that network
// call for simplicity.
inboxRouter.post('/:id/reply', async (req, res, next) => {
  const tenantId = req.header('x-tenant-id');
  const id = req.params.id;
  if (!tenantId) return res.status(400).json({ error: 'missing x-tenant-id header' });
  // Accept both camelCase and snake_case for the image URL to accommodate different clients
  const { text, imageUrl, image_url, caption } = req.body || {};
  // Determine the image value from either imageUrl or image_url
  const image = imageUrl ?? image_url ?? null;
  if (!text && !image) {
    return res.status(400).json({ error: 'either text or imageUrl must be provided' });
  }
  try {
    // Verify the conversation belongs to the tenant
    const convo = await pool.query(
      'select remote_jid, assigned_user_id from conversations where id = $1 and tenant_id = $2',
      [id, tenantId]
    );
    if (convo.rowCount === 0) return res.status(404).json({ error: 'conversation not found' });

    // Insert the message locally, falling back to caption if no text is provided. The image column
    // always uses the determined `image` value to ensure it is persisted.
    await pool.query(
      `insert into messages (conversation_id, sender_type, text, image_url)
       values ($1, 'agent', $2, $3)`,
      [id, text ?? caption ?? null, image]
    );

    // Optionally update assignment if it was previously unassigned
    if (!convo.rows[0].assigned_user_id) {
      // In a real system, user ID would come from authentication. Here we set it to null.
      await pool.query(
        'update conversations set assigned_user_id = null, updated_at = now() where id = $1',
        [id]
      );
    }

    // TODO: send the message via Evolution API. The client can call an internal
    // service here. For now we simply acknowledge the request.
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});