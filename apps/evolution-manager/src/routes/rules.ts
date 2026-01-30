import { Router } from 'express';
import { pool } from '../services/db.js';

/**
 * Rules router. Manages automatic handoff or other business logic triggered by
 * keywords. Each rule is scoped to a tenant and consists of an array of
 * trigger keywords and an action string. For example, triggers could be
 * ['comprar','pagar'] and action could be 'handoff_auto'.
 */
export const rulesRouter = Router();

// List all rules for a tenant
rulesRouter.get('/', async (req, res, next) => {
  const tenantId = req.header('x-tenant-id');
  if (!tenantId) return res.status(400).json({ error: 'missing x-tenant-id header' });
  try {
    const { rows } = await pool.query('select id, trigger_keywords, action, created_at from rules where tenant_id = $1 order by created_at desc', [tenantId]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Create a new rule
rulesRouter.post('/', async (req, res, next) => {
  const tenantId = req.header('x-tenant-id');
  const { triggerKeywords, action } = req.body || {};
  if (!tenantId) return res.status(400).json({ error: 'missing x-tenant-id header' });
  if (!Array.isArray(triggerKeywords) || triggerKeywords.length === 0) {
    return res.status(400).json({ error: 'triggerKeywords must be a non-empty array' });
  }
  if (!action || typeof action !== 'string') {
    return res.status(400).json({ error: 'action is required' });
  }
  try {
    const { rows } = await pool.query(
      'insert into rules (tenant_id, trigger_keywords, action) values ($1, $2, $3) returning id, trigger_keywords, action, created_at',
      [tenantId, triggerKeywords, action]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Delete a rule
rulesRouter.delete('/:id', async (req, res, next) => {
  const tenantId = req.header('x-tenant-id');
  const ruleId = req.params.id;
  if (!tenantId) return res.status(400).json({ error: 'missing x-tenant-id header' });
  try {
    const result = await pool.query('delete from rules where id = $1 and tenant_id = $2', [ruleId, tenantId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'rule not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});