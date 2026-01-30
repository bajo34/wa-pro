import { Router } from 'express';
import { pool } from '../services/db.js';

/**
 * Assignment router. Supports assigning and unassigning conversations to
 * specific users. A tenant identifier must be supplied via the
 * `x-tenant-id` header. In a real system the authenticated user would be
 * extracted from a session or token; here we accept the user ID from the
 * request body for demonstration purposes.
 */
export const assignmentRouter = Router();

// Assign a conversation to a user
assignmentRouter.post('/:id/assign', async (req, res, next) => {
  const tenantId = req.header('x-tenant-id');
  const conversationId = req.params.id;
  const { userId } = req.body || {};
  if (!tenantId) return res.status(400).json({ error: 'missing x-tenant-id header' });
  if (!userId) return res.status(400).json({ error: 'missing userId in body' });
  try {
    // Ensure conversation belongs to tenant
    const convo = await pool.query('select id from conversations where id = $1 and tenant_id = $2', [conversationId, tenantId]);
    if (convo.rowCount === 0) return res.status(404).json({ error: 'conversation not found' });
    await pool.query('update conversations set assigned_user_id = $1, updated_at = now() where id = $2', [userId, conversationId]);
    // Record in audit log
    await pool.query(
      'insert into audit_logs (tenant_id, user_id, action, details) values ($1, $2, $3, $4)',
      [tenantId, userId, 'assign_conversation', { conversationId }]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Unassign a conversation
assignmentRouter.post('/:id/unassign', async (req, res, next) => {
  const tenantId = req.header('x-tenant-id');
  const conversationId = req.params.id;
  const { userId } = req.body || {};
  if (!tenantId) return res.status(400).json({ error: 'missing x-tenant-id header' });
  try {
    // Ensure conversation belongs to tenant
    const convo = await pool.query('select id from conversations where id = $1 and tenant_id = $2', [conversationId, tenantId]);
    if (convo.rowCount === 0) return res.status(404).json({ error: 'conversation not found' });
    await pool.query('update conversations set assigned_user_id = null, updated_at = now() where id = $1', [conversationId]);
    // Record in audit log
    await pool.query(
      'insert into audit_logs (tenant_id, user_id, action, details) values ($1, $2, $3, $4)',
      [tenantId, userId ?? null, 'unassign_conversation', { conversationId }]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});