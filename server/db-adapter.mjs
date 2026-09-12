import { AsyncLocalStorage } from "node:async_hooks";
import { connect as connectSqlite } from "./db.mjs";

let pool = null;
let sqliteDb = null;
let isPostgres = false;
const txStorage = new AsyncLocalStorage();

export function convertSql(sql) {
  if (!isPostgres) return sql;

  // Convert SQLite INSERT OR IGNORE
  let converted = sql;
  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(converted)) {
    converted = converted.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO");
    if (!/ON\s+CONFLICT/i.test(converted)) {
      converted += " ON CONFLICT DO NOTHING";
    }
  }

  // Convert ? placeholders to $1, $2, $3...
  let paramIndex = 1;
  converted = converted.replace(/\?/g, () => `$${paramIndex++}`);

  return converted;
}

function cleanParams(params) {
  return params.map((x) => (x === undefined ? null : x));
}

export async function initDb(options = {}) {
  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL;
  const driver = options.driver || process.env.DATABASE_DRIVER;

  if (databaseUrl && driver !== "sqlite" && process.env.NODE_ENV !== "test") {
    const { Pool } = await import("pg");
    isPostgres = true;
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    // Test connection
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
    } finally {
      client.release();
    }
    return { driver: "postgres", pool };
  }

  // Offline / SQLite Fallback
  isPostgres = false;
  sqliteDb = options.sqliteDb || connectSqlite(options.sqlitePath || "./data/captureindia.sqlite");
  return { driver: "sqlite", db: sqliteDb };
}

export async function get(sql, ...params) {
  const p = cleanParams(params);
  if (isPostgres) {
    const client = txStorage.getStore() || pool;
    const res = await client.query(convertSql(sql), p);
    return res.rows[0] || null;
  }
  return sqliteDb.prepare(sql).get(...p) || null;
}

export async function all(sql, ...params) {
  const p = cleanParams(params);
  if (isPostgres) {
    const client = txStorage.getStore() || pool;
    const res = await client.query(convertSql(sql), p);
    return res.rows;
  }
  return sqliteDb.prepare(sql).all(...p);
}

export async function run(sql, ...params) {
  const p = cleanParams(params);
  if (isPostgres) {
    const client = txStorage.getStore() || pool;
    const res = await client.query(convertSql(sql), p);
    return { changes: res.rowCount };
  }
  return sqliteDb.prepare(sql).run(...p);
}

export async function tx(fn) {
  if (isPostgres) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await txStorage.run(client, async () => {
        return await fn();
      });
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  sqliteDb.exec("BEGIN IMMEDIATE");
  try {
    const out = await fn();
    sqliteDb.exec("COMMIT");
    return out;
  } catch (e) {
    sqliteDb.exec("ROLLBACK");
    throw e;
  }
}

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
  }
}

export function isCloudPostgres() {
  return isPostgres;
}
