import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../lib/env.js';
const { Pool } = pg;
function withLibpqCompat(url) {
    if (!url)
        return url;
    if (!/sslmode=/i.test(url))
        return url;
    if (/uselibpqcompat=/i.test(url))
        return url;
    const joiner = url.includes('?') ? '&' : '?';
    return `${url}${joiner}uselibpqcompat=true`;
}
function shouldRelaxTls(url) {
    if (!url)
        return false;
    return /sslmode=(require|verify-ca|verify-full|prefer)/i.test(url) || /\.supabase\.com/i.test(url);
}
const connectionString = withLibpqCompat(env.databaseUrl);
const ssl = shouldRelaxTls(connectionString) ? { rejectUnauthorized: false } : undefined;
export const pool = new Pool({
    connectionString,
    ssl,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000
});
export async function migrate() {
    const sqlPath = path.join(process.cwd(), 'sql', '001_init.sql');
    const sql = await fs.readFile(sqlPath, 'utf8');
    const client = await pool.connect();
    try {
        await client.query('begin');
        await client.query(sql);
        await client.query('commit');
    }
    catch (e) {
        await client.query('rollback');
        throw e;
    }
    finally {
        client.release();
    }
}
//# sourceMappingURL=db.js.map