import { Router } from 'express';
import { pool } from '../services/db.js';

/**
 * Audit log router. Returns recorded audit events for a tenant. Audit logs
 * capture administrative actions such as handoffs, rule changes and
 * assignments. Clients can paginate using `limit` and `offset` query
 * parameters.
 */
export const auditRouter = Router();

auditRouter.get('/', async (req, res, next) => {
  const tenantId = req.header('x-tenant-id');
  if (!tenantId) return res.status(400).json({ error: 'missing x-tenant-id header' });
  const limit = Math.min(Number(req.query.limit ?? '100'), 500);
  const offset = Number(req.query.offset ?? '0');
  try {
    const { rows } = await pool.query(
      'select id, user_id, action, details, created_at from audit_logs where tenant_id = $1 order by created_at desc limit $2 offset $3',
      [tenantId, limit, offset]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});