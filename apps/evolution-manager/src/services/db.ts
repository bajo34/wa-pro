import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../lib/env.js';

const { Pool } = pg;

// Create a connection pool to Postgres. Connection string is pulled from
// environment variables validated in src/lib/env.ts. A modest pool size is
// sufficient for a BFF service. Connection and idle timeouts mirror those
// used in the bot service.
export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000
});

/**
 * Runs the initial migration to create tables for the panel. The SQL file is
 * read from the `sql/001_init.sql` relative to the current working directory
 * when the container starts. If the tables already exist the statements are
 * idempotent (using `create table if not exists`).
 */
export async function migrate() {
  const sqlPath = path.join(process.cwd(), 'sql', '001_init.sql');
  const sql = await fs.readFile(sqlPath, 'utf8');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}