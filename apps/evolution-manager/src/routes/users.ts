import { Router } from 'express';
import { pool } from '../services/db.js';

/**
 * Users router. CRUD operations for panel users. All users are scoped to a
 * tenant. Passwords are stored as hashes; the caller must hash the
 * password before sending it to this API. Role enforcement should be
 * implemented in authentication middleware; here we perform no checks.
 */
export const usersRouter = Router();

// List users for a tenant
usersRouter.get('/', async (req, res, next) => {
  const tenantId = req.header('x-tenant-id');
  if (!tenantId) return res.status(400).json({ error: 'missing x-tenant-id header' });
  try {
    const { rows } = await pool.query('select id, username, role, created_at, updated_at from users where tenant_id = $1 order by created_at asc', [tenantId]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Create a new user
usersRouter.post('/', async (req, res, next) => {
  const tenantId = req.header('x-tenant-id');
  const { username, passwordHash, role } = req.body || {};
  if (!tenantId) return res.status(400).json({ error: 'missing x-tenant-id header' });
  if (!username || !passwordHash || !role) {
    return res.status(400).json({ error: 'username, passwordHash and role are required' });
  }
  try {
    const { rows } = await pool.query(
      'insert into users (tenant_id, username, password_hash, role) values ($1, $2, $3, $4) returning id, username, role, created_at, updated_at',
      [tenantId, username, passwordHash, role]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    // Unique username violation
    if ((err as any).code === '23505') {
      return res.status(409).json({ error: 'username already exists' });
    }
    next(err);
  }
});

// Update a user's role
usersRouter.put('/:id', async (req, res, next) => {
  const tenantId = req.header('x-tenant-id');
  const userId = req.params.id;
  const { role } = req.body || {};
  if (!tenantId) return res.status(400).json({ error: 'missing x-tenant-id header' });
  if (!role) return res.status(400).json({ error: 'role is required' });
  try {
    const { rows } = await pool.query(
      'update users set role = $1, updated_at = now() where id = $2 and tenant_id = $3 returning id, username, role, created_at, updated_at',
      [role, userId, tenantId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'user not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Delete a user
usersRouter.delete('/:id', async (req, res, next) => {
  const tenantId = req.header('x-tenant-id');
  const userId = req.params.id;
  if (!tenantId) return res.status(400).json({ error: 'missing x-tenant-id header' });
  try {
    const result = await pool.query('delete from users where id = $1 and tenant_id = $2', [userId, tenantId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'user not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});