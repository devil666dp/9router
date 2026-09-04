// Postgres adapter — same contract as the SQLite adapters, different engine.
//
// Enabled only when a Postgres URL is configured (see driver.js). When absent,
// nothing here is imported and the SQLite chain is untouched.
//
// Three impedance mismatches are handled here so that no SQL text in the repos
// has to change:
//
//  1. Placeholders. The repos write `?`; Postgres wants `$1..$n`.
//  2. Identifier case. Postgres folds unquoted identifiers to lower case in DDL
//     *and* in queries, so the existing unquoted SQL round-trips fine — but
//     `SELECT *` hands back lower-cased KEYS (`createdat`, not `createdAt`).
//     Result keys are re-cased through schema.js's COLUMN_CASE_MAP.
//  3. Types. int8 (COUNT(*), SUM()) arrives as a string; JS booleans bound to
//     INTEGER columns raise 22P02. Both are normalized.
import { AsyncLocalStorage } from "node:async_hooks";
import { COLUMN_CASE_MAP, PRIMARY_KEY_COLUMNS } from "../schema.js";

// ── SQL translation ──────────────────────────────────────────────────────
// Everything below rewrites SQLite-flavoured SQL on its way to Postgres, so
// the repos keep one single-sourced set of query strings. Each rewrite is
// keyed to a construct actually used in this codebase — not a general
// SQLite→PG transpiler.

// `?` → `$1..$n`, skipping anything inside a single-quoted literal so a `?`
// in a LIKE pattern or a default string is never treated as a placeholder.
export function toPgPlaceholders(sql) {
  let out = "";
  let n = 0;
  let inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inStr) {
      out += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") { out += sql[++i]; continue; } // escaped ''
        inStr = false;
      }
      continue;
    }
    if (ch === "'") { inStr = true; out += ch; continue; }
    if (ch === "?") { out += `$${++n}`; continue; }
    out += ch;
  }
  return out;
}

// `INSERT OR REPLACE INTO t(cols) VALUES(…)` → `INSERT INTO t(cols) VALUES(…)
// ON CONFLICT (pk) DO UPDATE SET <every non-pk col> = excluded.<col>`.
//
// Rewriting here rather than editing the 21 call sites keeps one SQL string per
// statement working on both engines. `INSERT OR IGNORE` maps to DO NOTHING.
// The conflict target comes from PRIMARY_KEY_COLUMNS, so it tracks the schema.
export function rewriteUpsert(sql, primaryKeys) {
  const m = sql.match(/^\s*INSERT\s+OR\s+(REPLACE|IGNORE)\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)([\s\S]*)$/i);
  if (!m) return sql;
  const [, verb, table, colList, tail] = m;
  const head = `INSERT INTO ${table}(${colList})${tail}`;
  const pk = primaryKeys[table] || primaryKeys[table.toLowerCase()] || [];
  if (verb.toUpperCase() === "IGNORE" || pk.length === 0) {
    return `${head} ON CONFLICT DO NOTHING`;
  }
  const pkLower = new Set(pk.map((c) => c.toLowerCase()));
  const cols = colList.split(",").map((c) => c.trim()).filter(Boolean);
  const updates = cols
    .filter((c) => !pkLower.has(c.toLowerCase()))
    .map((c) => `${c} = excluded.${c}`);
  if (updates.length === 0) return `${head} ON CONFLICT (${pk.join(", ")}) DO NOTHING`;
  return `${head} ON CONFLICT (${pk.join(", ")}) DO UPDATE SET ${updates.join(", ")}`;
}

// SELECT * hands back lower-cased keys. Re-case only the keys the schema
// declares in mixed case; everything else (already-lowercase columns, SQL
// aliases) passes through untouched. Rows without any foldable key are
// returned as-is so the common path allocates nothing.
function recaseRow(row) {
  if (!row) return row;
  let out = null;
  for (const k in row) {
    const proper = COLUMN_CASE_MAP.get(k);
    if (proper && proper !== k) {
      if (!out) out = { ...row };
      out[proper] = row[k];
      delete out[k];
    }
  }
  return out || row;
}

// A JS boolean bound to an INTEGER column raises 22P02 on Postgres
// ("invalid input syntax for type integer: \"true\"") where SQLite would have
// stored 1/0. The repos already normalize most of these; this is the backstop.
function normalizeParams(params) {
  if (!params || params.length === 0) return params || [];
  let out = params;
  for (let i = 0; i < params.length; i++) {
    const v = params[i];
    if (typeof v === "boolean" || v === undefined) {
      if (out === params) out = params.slice();
      out[i] = v === undefined ? null : v ? 1 : 0;
    }
  }
  return out;
}

// ── Connection string / TLS ──────────────────────────────────────────────
// pg 8.x currently treats `sslmode=require` as full verification and warns that
// v9 will switch to libpq's weaker semantics. Resolving TLS here — and handing
// pg an explicit `ssl` object instead of letting it read sslmode — pins the
// behaviour across pg versions and silences the deprecation notice.
export function resolveSsl(url) {
  const mode = (url.searchParams.get("sslmode") || "").toLowerCase();
  const local = ["localhost", "127.0.0.1", "::1", ""].includes(url.hostname);
  if (mode === "disable") return false;
  if (mode === "no-verify" || mode === "allow" || mode === "prefer") {
    return { rejectUnauthorized: false };
  }
  if (!mode) return local ? false : { rejectUnauthorized: true };
  return { rejectUnauthorized: true };
}

function buildPoolConfig(rawUrl) {
  const url = new URL(rawUrl);
  const ssl = resolveSsl(url);
  // pg reads these itself and warns about sslmode; we resolved them already.
  url.searchParams.delete("sslmode");
  url.searchParams.delete("channel_binding");
  return {
    connectionString: url.toString(),
    ssl,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30_000),
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 15_000),
    application_name: "9router",
  };
}

// ── Adapter ──────────────────────────────────────────────────────────────
// Retry budget for serialization failures. Measured against Neon: 20 writers
// racing on ONE row needed up to 11 retries for the last one to land, so a
// budget of 8 turned honest contention into a thrown 40001. 25 covers that
// with headroom; exceeding it means something is genuinely wedged, not busy.
const MAX_TX_RETRIES = 25;
// Backoff must be capped, not purely exponential: at attempt 20 an uncapped
// 10 * 2**n is minutes of sleep. Full jitter in [0, cap) so concurrent losers
// do not retry in lockstep.
const BACKOFF_BASE_MS = 10;
const BACKOFF_CAP_MS = 200;
// 40001 serialization_failure, 40P01 deadlock_detected — the two errors a
// SERIALIZABLE transaction is *expected* to raise under contention. Retrying
// them is part of using that isolation level, not error recovery.
const RETRYABLE = new Set(["40001", "40P01"]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const backoffMs = (attempt) =>
  Math.floor(Math.random() * Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS));

let spCounter = 0;

export async function createPgAdapter(connectionString) {
  const pg = (await import("pg")).default;

  // int8 (COUNT(*), SUM()) arrives as a string because it can exceed 2^53.
  // Every int8 this app reads is a row count or a token total, so parsing to
  // Number keeps `row.c === 0` and `cnt.c > max` comparisons working the way
  // they do on SQLite. Global to the pg module, process-local.
  pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

  const pool = new pg.Pool(buildPoolConfig(connectionString));
  // An idle-client error (Neon closing a pooled connection) must not become an
  // unhandled 'error' event and kill the process.
  pool.on("error", (e) => console.warn(`[DB][pg] idle client error: ${e.message}`));

  // Verify connectivity up front so driver.js can fall back on a bad URL
  // instead of failing later on the first query.
  const probe = await pool.connect();
  try {
    const { rows } = await probe.query("SELECT current_database() AS db, version() AS v");
    console.log(`[DB][pg] connected: ${rows[0].db} | ${String(rows[0].v).split(" ").slice(0, 2).join(" ")}`);
  } finally {
    probe.release();
  }

  // Holds the client a transaction is pinned to. A pg transaction lives on ONE
  // pooled connection, so every statement inside `transaction(fn)` — including
  // ones issued from helpers several frames deep that only see `db` — has to
  // reach that same client. AsyncLocalStorage carries it without threading a
  // client argument through every repo function.
  const als = new AsyncLocalStorage();

  function translate(sql) {
    return toPgPlaceholders(rewriteUpsert(sql, PRIMARY_KEY_COLUMNS));
  }

  async function query(sql, params = []) {
    const store = als.getStore();
    const text = translate(sql);
    const runner = store ? store.client : pool;
    // No params → simple query protocol, which is what lets exec() send several
    // statements in one string (the extended protocol allows only one).
    if (!params || params.length === 0) return runner.query(text);
    return runner.query(text, normalizeParams(params));
  }

  const isRetryable = (e) => RETRYABLE.has(e?.code);

  async function runTransaction(fn) {
    const store = als.getStore();

    // Nested: SAVEPOINT on the already-pinned client. Retries belong to the
    // outermost transaction, which owns the BEGIN.
    if (store) {
      const sp = `sp_${(spCounter = (spCounter + 1) % 1e9)}`;
      await store.client.query(`SAVEPOINT ${sp}`);
      try {
        const result = await fn();
        await store.client.query(`RELEASE SAVEPOINT ${sp}`);
        return result;
      } catch (e) {
        // Must roll back to the savepoint: after an error the transaction is
        // aborted (25P02) and rejects every further statement until it does.
        try { await store.client.query(`ROLLBACK TO SAVEPOINT ${sp}`); } catch {}
        throw e;
      }
    }

    // Outermost: real transaction on a dedicated client.
    //
    // SERIALIZABLE rather than the default READ COMMITTED because the repos are
    // full of read-modify-write transactions (settings merge, OAuth token
    // merge, the usage lifetime counter) that were written against SQLite's
    // single-writer guarantee. Under READ COMMITTED two concurrent merges each
    // read the same row and the second silently overwrites the first — measured
    // 8 of 50 increments surviving. SERIALIZABLE turns that lost update into a
    // 40001 we retry, restoring the previous semantics without touching a
    // single repo.
    let lastErr;
    for (let attempt = 0; attempt < MAX_TX_RETRIES; attempt++) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        const result = await als.run({ client }, fn);
        await client.query("COMMIT");
        return result;
      } catch (e) {
        try { await client.query("ROLLBACK"); } catch {}
        lastErr = e;
        if (!isRetryable(e) || attempt === MAX_TX_RETRIES - 1) throw e;
        await sleep(backoffMs(attempt));
      } finally {
        client.release();
      }
    }
    throw lastErr;
  }

  return {
    driver: "pg",
    dialect: "postgres",

    async run(sql, params = []) {
      const res = await query(sql, params);
      // Shaped like the SQLite drivers' run() result. lastInsertRowid has no
      // portable equivalent (it would need RETURNING); nothing in this codebase
      // reads it, and `changes` is read in apiKeysRepo/combosRepo.
      return { changes: res.rowCount ?? 0, lastInsertRowid: null };
    },

    async get(sql, params = []) {
      const res = await query(sql, params);
      return res.rows.length ? recaseRow(res.rows[0]) : undefined;
    },

    async all(sql, params = []) {
      const res = await query(sql, params);
      return res.rows.map(recaseRow);
    },

    // Multi-statement DDL/SQL, no params — matches the SQLite exec() contract.
    async exec(sql) {
      await query(sql, []);
    },

    transaction: runTransaction,

    // WAL-specific; meaningless on Postgres.
    checkpoint() {},

    async close() {
      await pool.end();
    },

    raw: pool,
  };
}
