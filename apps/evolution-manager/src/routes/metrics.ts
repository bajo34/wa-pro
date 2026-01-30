import { Router } from 'express';
import { pool } from '../services/db.js';

/**
 * Metrics router. Provides simple aggregated statistics for a tenant. These
 * metrics power dashboard views in the panel. For more complex analytics
 * consider using a separate analytics pipeline.
 */
export const metricsRouter = Router();

metricsRouter.get('/', async (req, res, next) => {
  const tenantId = req.header('x-tenant-id');
  if (!tenantId) return res.status(400).json({ error: 'missing x-tenant-id header' });
  try {
    // IMPORTANT: use a single query (single DB connection) to avoid connection
    // spikes that can trip Postgres "too many clients already" limits.
    const { rows } = await pool.query(
      `
      select
        count(*) filter (where c.status = 'open')::int as "openConversations",
        count(*) filter (where c.status = 'closed')::int as "closedConversations",
        count(m.id)::int as "totalMessages",
        count(m.id) filter (where m.created_at >= now() - interval '24 hours')::int as "messages24h"
      from conversations c
      left join messages m on m.conversation_id = c.id
      where c.tenant_id = $1
      `,
      [tenantId]
    );

    res.json(
      rows?.[0] ?? {
        openConversations: 0,
        closedConversations: 0,
        totalMessages: 0,
        messages24h: 0
      }
    );
  } catch (err) {
    next(err);
  }
});