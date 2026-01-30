import { Router } from 'express';
import { pool } from '../services/db.js';

/**
 * Quick replies router. CRUD operations for canned responses that agents can
 * insert quickly during a conversation. Each quick reply belongs to a
 * tenant.
 */
export const quickReplyRouter = Router();

// List quick replies
quickReplyRouter.get('/', async (req, res, next) => {
  const tenantId = req.header('x-tenant-id');
  if (!tenantId) return res.status(400).json({ error: 'missing x-tenant-id header' });
  try {
    const { rows } = await pool.query('select id, label, text, created_at from quick_replies where tenant_id = $1 order by created_at desc', [tenantId]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Create a quick reply
quickReplyRouter.post('/', async (req, res, next) => {
  const tenantId = req.header('x-tenant-id');
  const { label, text } = req.body || {};
  if (!tenantId) return res.status(400).json({ error: 'missing x-tenant-id header' });
  if (!label || !text) return res.status(400).json({ error: 'label and text are required' });
  try {
    const { rows } = await pool.query(
      'insert into quick_replies (tenant_id, label, text) values ($1, $2, $3) returning id, label, text, created_at',
      [tenantId, label, text]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Update a quick reply
quickReplyRouter.put('/:id', async (req, res, next) => {
  const tenantId = req.header('x-tenant-id');
  const quickId = req.params.id;
  const { label, text } = req.body || {};
  if (!tenantId) return res.status(400).json({ error: 'missing x-tenant-id header' });
  if (!label && !text) return res.status(400).json({ error: 'label or text must be provided' });
  try {
    // Build dynamic set clause
    const sets: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (label) {
      sets.push(`label = $${idx++}`);
      values.push(label);
    }
    if (text) {
      sets.push(`text = $${idx++}`);
      values.push(text);
    }
    values.push(quickId);
    values.push(tenantId);
    const result = await pool.query(
      `update quick_replies set ${sets.join(', ')}, created_at = created_at where id = $${idx++} and tenant_id = $${idx} returning id, label, text, created_at`,
      values
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'quick reply not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Delete a quick reply
quickReplyRouter.delete('/:id', async (req, res, next) => {
  const tenantId = req.header('x-tenant-id');
  const quickId = req.params.id;
  if (!tenantId) return res.status(400).json({ error: 'missing x-tenant-id header' });
  try {
    const result = await pool.query('delete from quick_replies where id = $1 and tenant_id = $2', [quickId, tenantId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'quick reply not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});