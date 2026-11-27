import pg from 'pg';
import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { config } from './config.js';

import { getWallet, ensureWallet, creditWallet, debitWallet, earnedByCategory, withdrawalsByBucket, withdrawalsToday } from './wallet.js';

let pool = null;
let migratedPromise = null;
let startedPromise = null;

// Type parsers: PostgreSQL returns COUNT/SUM as strings, convert to numbers
pg.types.setTypeParser(20, (value) => (value === null ? null : Number(value))); // int8
pg.types.setTypeParser(21, (value) => (value === null ? null : Number(value))); // int2
pg.types.setTypeParser(23, (value) => (value === null ? null : Number(value))); // int4
pg.types.setTypeParser(701, (value) => (value === null ? null : Number(value))); // float8
pg.types.setTypeParser(1700, (value) => (value === null ? null : Number(value))); // numeric

fs.mkdirSync(config.uploadsDir, { recursive: true });

const localPort = (() => { try { const url = new URL(config.databaseUrl); return url.port !== '5432' && url.port !== ''; } catch { return false; } })();
if (localPort) console.log('[db] non-default db port detected');

function getPool() {
  if (pool) return pool;
  console.log(`[db] connecting to ${config.databaseUrl.replace(/:[^:]+@/, ':[password]@')}`);
  
  // Parse the connection string to force IPv4 and extract components
  let parsed;
  try {
    parsed = new URL(config.databaseUrl);
  } catch (e) {
    console.error('[db] invalid DATABASE_URL:', e.message);
    throw e;
  }
  
  const sslConfig = config.databaseSsl && !localPort ? { rejectUnauthorized: false } : undefined;
  
  pool = new pg.Pool({
    host: parsed.hostname,
    port: parseInt(parsed.port, 10) || 5432,
    database: parsed.pathname.replace(/^\/+/, ''),
    user: parsed.username,
    password: parsed.password,
    max: config.dbPoolSize,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    ssl: sslConfig,
    connectionParams: { connect_timeout: 15, target_session_attrs: 'any' },
  });
  pool.on('error', (error) => console.error('[db] idle client error', error.message));
  pool.on('connect', (client) => client.on('error', (e) => console.error('[db] client error', e.message)));
  return pool;
}

const context = new AsyncLocalStorage();
getPool().on('connect', (client) => { client.on('error', (e) => console.error('[db] client error', e.message)); });


function numbered(sql) {
  let index = 0;
  let out = '';
  let quote = null;
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    if (quote) {
      out += char;
      if (char === quote) {
        if (sql[i + 1] === quote) {
          out += sql[i + 1];
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      out += char;
      continue;
    }
    if (char === '?') {
      index += 1;
      out += `$${index}`;
      continue;
    }
    out += char;
  }
  return out;
}

function compatible(sql) {
  const text = sql.trim();
  const ignore = /^insert\s+or\s+ignore\s+into/i.test(text);
  let out = numbered(ignore ? text.replace(/^insert\s+or\s+ignore\s+into/i, 'INSERT INTO') : text);
  if (ignore && !/on\s+conflict/i.test(out)) {
    // Place ON CONFLICT before RETURNING (RETURNING must come last)
    if (/returning\s+/i.test(out)) {
      out = out.replace(/(returning\s+.*)/i, ` ON CONFLICT DO NOTHING $1`);
    } else {
      out = `${out} ON CONFLICT DO NOTHING`;
    }
  }
  out = out.replace(/date\(\s*([a-z_.]+)\s*,\s*'\+3 hours'\s*\)/gi, `(($1::timestamptz) AT TIME ZONE 'Africa/Nairobi')::date`);
  out = out.replace(/json_extract\(\s*([a-zA-Z_.]+)\s*,\s*'\$\.([a-zA-Z_]+)'\s*\)/gi, `($1::jsonb ->> '$2')`);
  return out;
}

async function run(sql, args) {
  const text = compatible(sql);
  const client = context.getStore() || pool;
  return client.query(text, args);
}

function prepare(sql) {
  const isInsert = /^\s*insert\s+into/i.test(sql);
  return {
    get: (...args) => run(sql, args).then((result) => result.rows[0]),
    all: (...args) => run(sql, args).then((result) => result.rows),
    run: async (...args) => {
      const wantsRow = isInsert && !/returning\s/i.test(sql);
      const result = await run(wantsRow ? `${sql} RETURNING *` : sql, args);
      const row = result.rows?.[0];
      return {
        changes: result.rowCount || 0,
        lastInsertRowid: row?.id ?? null,
        rows: result.rows || [],
      };
    },
  };
}

export function transaction(fn) {
  return async (...args) => {
    if (context.getStore()) return fn(...args);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await context.run(client, () => fn(...args));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {}
      throw error;
    } finally {
      client.release();
    }
  };
}

export const db = {
  prepare,
  transaction,
  exec: (sql) => run(sql, []),
  query: (sql, args = []) => run(sql, args),
  ensureWallet,
  getWallet,
  creditWallet,
  debitWallet,
  earnedByCategory,
  withdrawalsByBucket,
  withdrawalsToday,
};

export { ensureWallet, getWallet, creditWallet, debitWallet, earnedByCategory, withdrawalsByBucket, withdrawalsToday };

export async function connect() {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
  return p;
}

export async function start() {
  if (startedPromise) return startedPromise;
  startedPromise = connect().then(() => db.exec('SELECT 1'));
  return startedPromise;
}

export function detach(fn) {
  return (...args) => {
    pool.connect().then((client) => {
      fn(client).catch((error) => console.error('[db] detach error', error));
    }).catch((error) => console.error('[db] detach connect error', error));
  };
}
