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

// Pre-resolve database hostname to IPv4 to avoid IPv6 connectivity issues on Render
export async function resolveDbHost() {
  const dns = await import('node:dns');
  let parsed;
  try {
    parsed = new URL(config.databaseUrl);
  } catch {
    return; // Not a valid URL, skip resolution
  }
  
  const originalPort = parsed.port || 5432;
  
  console.log(`[db] attempting DNS resolution for ${parsed.hostname}`);
  
  // Method 1: Try dns.lookup with family: 4 and V4MAPPED
  try {
    const lookupResult = await new Promise((resolve, reject) => {
      dns.lookup(parsed.hostname, { family: 4, hints: dns.ADDRCONFIG | dns.V4MAPPED }, (err, address, family) => {
        if (err) reject(err);
        else resolve({ address, family });
      });
    });
    if (lookupResult && lookupResult.family === 4) {
      console.log(`[db] resolved ${parsed.hostname} to ${lookupResult.address} (IPv4 via lookup)`);
      config.databaseUrl = `postgresql://${parsed.username}:${parsed.password}@${lookupResult.address}:${originalPort}${parsed.pathname}`;
      console.log(`[db] using IPv4 connection: ${config.databaseUrl.replace(/:[^:]+@/, ':[password]@')}`);
      return;
    }
    console.log(`[db] lookup returned family=${lookupResult?.family}`);
  } catch (e) {
    console.log(`[db] dns.lookup(family=4) failed: ${e.message}`);
  }
  
  // Method 2: Try dns.lookup without family restriction to see what resolves
  try {
    const anyResult = await new Promise((resolve, reject) => {
      dns.lookup(parsed.hostname, (err, address, family) => {
        if (err) reject(err);
        else resolve({ address, family });
      });
    });
    console.log(`[db] lookup without family: ${anyResult.address} (family=${anyResult.family})`);
    if (anyResult.family === 4) {
      config.databaseUrl = `postgresql://${parsed.username}:${parsed.password}@${anyResult.address}:${originalPort}${parsed.pathname}`;
      console.log(`[db] using IPv4 connection: ${config.databaseUrl.replace(/:[^:]+@/, ':[password]@')}`);
      return;
    }
    // If we got IPv6, try to convert to IPv4-mapped IPv6 address
    if (anyResult.family === 6 && anyResult.address.startsWith('::ffff:')) {
      const ipv4 = anyResult.address.slice(7);
      config.databaseUrl = `postgresql://${parsed.username}:${parsed.password}@${ipv4}:${originalPort}${parsed.pathname}`;
      console.log(`[db] using IPv4-mapped address: ${config.databaseUrl.replace(/:[^:]+@/, ':[password]@')}`);
      return;
    }
  } catch (e) {
    console.log(`[db] dns.lookup failed: ${e.message}`);
  }
  
  // Method 3: Try dns.resolve4
  try {
    const resolveResult = await new Promise((resolve, reject) => {
      dns.resolve4(parsed.hostname, (err, ips) => err ? reject(err) : resolve(ips));
    });
    if (resolveResult.length > 0) {
      console.log(`[db] resolved ${parsed.hostname} to ${resolveResult[0]} (IPv4 via resolve4)`);
      config.databaseUrl = `postgresql://${parsed.username}:${parsed.password}@${resolveResult[0]}:${originalPort}${parsed.pathname}`;
      console.log(`[db] using IPv4 connection: ${config.databaseUrl.replace(/:[^:]+@/, ':[password]@')}`);
      return;
    }
  } catch (e) {
    console.log(`[db] dns.resolve4 failed: ${e.message}`);
  }
  
  // Method 4: Supabase direct endpoint (port 5432) is IPv6-only. 
  // Try the shared pooler (port 6543) which supports IPv4.
  if (originalPort === 5432) {
    console.log(`[db] Direct connection (port 5432) appears to be IPv6-only.`);
    console.log(`[db] Switching to Supabase shared pooler on port 6543 (IPv4-compatible)...`);
    config.databaseUrl = `postgresql://${parsed.username}:${parsed.password}@${parsed.hostname}:6543${parsed.pathname}`;
    console.log(`[db] new connection string: ${config.databaseUrl.replace(/:[^:]+@/, ':[password]@')}`);
    
    // Try to resolve the hostname again for the pooler
    try {
      const poolerLookup = await new Promise((resolve, reject) => {
        dns.lookup(parsed.hostname, { family: 4, hints: dns.ADDRCONFIG }, (err, address, family) => {
          if (err) reject(err);
          else resolve({ address, family });
        });
      });
      if (poolerLookup && poolerLookup.family === 4) {
        config.databaseUrl = `postgresql://${parsed.username}:${parsed.password}@${poolerLookup.address}:6543${parsed.pathname}`;
        console.log(`[db] pooler IPv4: ${config.databaseUrl.replace(/:[^:]+@/, ':[password]@')}`);
      }
    } catch (e) {
      console.log(`[db] pooler DNS also failed, using hostname directly on port 6543`);
    }
  } else {
    console.log(`[db] Cannot resolve database hostname: ${e?.message || 'unknown error'}`);
    console.log(`[db] Network configuration issue - Render may not have DNS access to Supabase.`);
  }
}

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
    connectionString: config.databaseUrl,
    max: config.dbPoolSize,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    ssl: sslConfig,
    connectionParams: { connect_timeout: 15, target_session_attrs: 'any', options: '-c dns_resolution_variant=1' },
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
  // Resolve database host to IPv4 before connecting
  await resolveDbHost().catch(() => {});
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
