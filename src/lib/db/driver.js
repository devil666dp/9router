import { ensureDirs, DATA_FILE } from "./paths.js";

// Use global to survive Next.js dev hot-reload (module state resets on reload)
if (!global._dbAdapter) global._dbAdapter = { instance: null, initPromise: null, logged: false };
const state = global._dbAdapter;

async function tryBunSqlite() {
  // Bun runtime only — built-in, no install needed
  if (!process.versions.bun) return null;
  try {
    const { createBunSqliteAdapter } = await import("./adapters/bunSqliteAdapter.js");
    return await createBunSqliteAdapter(DATA_FILE);
  } catch (e) {
    console.warn(`[DB] bun:sqlite unavailable: ${e.message}`);
    return null;
  }
}

async function tryBetterSqlite() {
  // Skip on Bun — better-sqlite3 native bindings unsupported
  if (process.versions.bun) return null;
  try {
    const { createBetterSqliteAdapter } = await import("./adapters/betterSqliteAdapter.js");
    return createBetterSqliteAdapter(DATA_FILE);
  } catch (e) {
    console.warn(`[DB] better-sqlite3 unavailable: ${e.message}`);
    return null;
  }
}

async function tryNodeSqlite() {
  // Built-in since Node 22.5.0 — no install needed. Skip under Bun (no node:sqlite).
  if (process.versions.bun) return null;
  const [maj, min] = process.versions.node.split(".").map(Number);
  if (maj < 22 || (maj === 22 && min < 5)) return null;
  try {
    const { createNodeSqliteAdapter } = await import("./adapters/nodeSqliteAdapter.js");
    return await createNodeSqliteAdapter(DATA_FILE);
  } catch (e) {
    console.warn(`[DB] node:sqlite unavailable: ${e.message}`);
    return null;
  }
}

// Which engine to use, set explicitly. This is the knob to reach for when you
// want the store chosen by configuration rather than inferred:
//   DB_DRIVER=postgres  → Postgres, and it is an error if no URL is present
//   DB_DRIVER=sqlite    → SQLite, even if a Postgres URL is exported
// Unset → inferred from the URL variables below, which is what a hosted deploy
// expects (set DATABASE_URL, get Postgres).
const DRIVER_ALIASES = {
  postgres: "postgres", postgresql: "postgres", pg: "postgres",
  sqlite: "sqlite", sqlite3: "sqlite", local: "sqlite",
};

export function getDbDriverPreference(env = process.env) {
  const raw = (env.DB_DRIVER || "").trim().toLowerCase();
  if (!raw) return null;
  const pref = DRIVER_ALIASES[raw];
  if (!pref) {
    console.warn(`[DB] DB_DRIVER='${raw}' unrecognised (use postgres|sqlite) → ignoring`);
    return null;
  }
  return pref;
}

// URL variables that switch the store on their own. Both are de-facto standards
// meaning "this is the application's database": DATABASE_URL everywhere,
// POSTGRES_URL from the Vercel/Neon integrations.
const PG_URL_ENV_VARS = ["DATABASE_URL", "POSTGRES_URL"];

// Vendor-specific names, read ONLY when DB_DRIVER=postgres asks for Postgres
// outright. On their own they do not switch anything: people keep one in .env as
// a credential for scripts and tests, where it means "a Postgres I can reach",
// not "move this install's store". Auto-activating on one silently moved a
// running install off its populated SQLite file onto an empty database, and
// surfaced as a 401 at the dashboard login rather than as a database error.
// Pairing them with an explicit DB_DRIVER keeps the convenience without the trap.
const PG_URL_VENDOR_VARS = ["NEON_DB_URL", "SUPABASE_DB_URL", "PG_URL", "PGURL"];

function firstPgUrl(env, names) {
  for (const name of names) {
    const v = (env[name] || "").trim();
    if (!v) continue;
    if (/^postgres(ql)?:\/\//i.test(v)) return { url: v, source: name };
  }
  return null;
}

export function getPostgresUrl(env = process.env) {
  const pref = getDbDriverPreference(env);
  if (pref === "sqlite") return null;
  if (pref === "postgres") {
    const found = firstPgUrl(env, [...PG_URL_ENV_VARS, ...PG_URL_VENDOR_VARS]);
    if (found) return found;
    // Asked for Postgres and gave no URL: falling back to SQLite here would put
    // the app on a different store than the operator configured.
    throw new Error(
      `[DB] DB_DRIVER=postgres but no postgres:// URL found in ${[...PG_URL_ENV_VARS, ...PG_URL_VENDOR_VARS].join(", ")}`
    );
  }
  return firstPgUrl(env, PG_URL_ENV_VARS);
}

async function tryPostgres() {
  const found = getPostgresUrl();
  if (!found) return null;
  try {
    const { createPgAdapter } = await import("./adapters/pgAdapter.js");
    const adapter = await createPgAdapter(found.url);
    console.log(`[DB] Postgres via ${found.source}`);
    return adapter;
  } catch (e) {
    // Falling through to SQLite on a bad URL would silently split the app's
    // state across two stores. A configured Postgres that cannot be reached is
    // a hard failure.
    throw new Error(`[DB] Postgres (${found.source}) unavailable: ${e.message}`);
  }
}

async function trySqlJs() {
  try {
    const { createSqlJsAdapter } = await import("./adapters/sqljsAdapter.js");
    return await createSqlJsAdapter(DATA_FILE);
  } catch (e) {
    console.warn(`[DB] sql.js unavailable: ${e.message}`);
    return null;
  }
}

async function initAdapter() {
  // Postgres first: when a URL is configured it is the store, no fallback.
  let adapter = await tryPostgres();
  if (adapter) {
    if (!state.logged) {
      console.log(`[DB] Driver: ${adapter.driver}`);
      state.logged = true;
    }
    const { runMigrationOnce } = await import("./migrate.js");
    await runMigrationOnce(adapter);
    return adapter;
  }

  ensureDirs();
  // Order per runtime:
  //   Bun:  bun:sqlite → sql.js
  //   Node: better-sqlite3 → node:sqlite (≥22.5) → sql.js
  adapter = await tryBunSqlite();
  if (!adapter) adapter = await tryBetterSqlite();
  if (!adapter) adapter = await tryNodeSqlite();
  if (!adapter) adapter = await trySqlJs();
  if (!adapter) throw new Error("[DB] No SQLite driver available (bun/better/node/sql.js all failed)");

  if (!state.logged) {
    console.log(`[DB] Driver: ${adapter.driver} | file: ${DATA_FILE}`);
    state.logged = true;
  }

  const { runMigrationOnce } = await import("./migrate.js");
  await runMigrationOnce(adapter);
  return adapter;
}

export async function getAdapter() {
  if (state.instance) return state.instance;
  if (!state.initPromise) state.initPromise = initAdapter().then((a) => { state.instance = a; return a; });
  return state.initPromise;
}

export function getAdapterSync() {
  if (!state.instance) throw new Error("[DB] adapter not initialized — await getAdapter() first");
  return state.instance;
}
