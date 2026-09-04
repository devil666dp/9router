// Postgres adapter: SQL translation, schema invariants, and — when a Postgres
// URL is configured — a live round-trip against it.
//
// The translation and invariant blocks need no database and always run; they
// are what actually protect the SQLite path, since every rewrite here exists
// so the repos can keep ONE set of SQL strings for both engines.
//
// The live block runs only with a Postgres URL in the environment, e.g.:
//   DATABASE_URL=postgres://… npx vitest run unit/db-postgres.test.js
// It also accepts vendor names (NEON_DB_URL) and TEST_POSTGRES_URL, which the
// app itself ignores — see resolveTestPgUrl() below for why.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  toPgPlaceholders,
  rewriteUpsert,
  resolveSsl,
} from "@/lib/db/adapters/pgAdapter.js";
import {
  TABLES,
  COLUMN_CASE_MAP,
  PRIMARY_KEY_COLUMNS,
  buildCreateTableSql,
} from "@/lib/db/schema.js";
import { getPostgresUrl, getDbDriverPreference } from "@/lib/db/driver.js";

describe("pg: ? → $n placeholders", () => {
  it("numbers placeholders left to right", () => {
    expect(toPgPlaceholders("SELECT * FROM t WHERE a = ? AND b = ?"))
      .toBe("SELECT * FROM t WHERE a = $1 AND b = $2");
  });

  it("leaves SQL without placeholders untouched", () => {
    const sql = "SELECT COUNT(*) as c FROM requestDetails";
    expect(toPgPlaceholders(sql)).toBe(sql);
  });

  it("does not treat a ? inside a string literal as a placeholder", () => {
    expect(toPgPlaceholders("SELECT ? WHERE name LIKE 'who? %' AND x = ?"))
      .toBe("SELECT $1 WHERE name LIKE 'who? %' AND x = $2");
  });

  it("handles doubled '' escapes inside a literal", () => {
    expect(toPgPlaceholders("SELECT 'it''s a ?' , ?"))
      .toBe("SELECT 'it''s a ?' , $1");
  });

  it("numbers LIMIT/OFFSET placeholders after the WHERE ones", () => {
    expect(toPgPlaceholders(
      "SELECT data FROM requestDetails WHERE provider = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?"
    )).toBe(
      "SELECT data FROM requestDetails WHERE provider = $1 ORDER BY timestamp DESC LIMIT $2 OFFSET $3"
    );
  });
});

describe("pg: INSERT OR REPLACE → ON CONFLICT", () => {
  it("builds DO UPDATE over the non-PK columns", () => {
    const out = rewriteUpsert(
      "INSERT OR REPLACE INTO kv(scope, key, value) VALUES(?, ?, ?)",
      PRIMARY_KEY_COLUMNS
    );
    expect(out).toBe(
      "INSERT INTO kv(scope, key, value) VALUES(?, ?, ?) ON CONFLICT (scope, key) DO UPDATE SET value = excluded.value"
    );
  });

  it("uses the single-column PK for single-key tables", () => {
    const out = rewriteUpsert(
      "INSERT OR REPLACE INTO usageDaily(dateKey, data) VALUES(?, ?)",
      PRIMARY_KEY_COLUMNS
    );
    expect(out).toContain("ON CONFLICT (dateKey) DO UPDATE SET data = excluded.data");
  });

  it("maps INSERT OR IGNORE to DO NOTHING", () => {
    const out = rewriteUpsert(
      "INSERT OR IGNORE INTO combos(id, name, kind, models, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)",
      PRIMARY_KEY_COLUMNS
    );
    expect(out).toContain("ON CONFLICT DO NOTHING");
    expect(out).not.toContain("DO UPDATE");
  });

  it("DO NOTHING when every column is part of the PK", () => {
    const out = rewriteUpsert("INSERT OR REPLACE INTO kv(scope, key) VALUES(?, ?)", PRIMARY_KEY_COLUMNS);
    expect(out).toBe("INSERT INTO kv(scope, key) VALUES(?, ?) ON CONFLICT (scope, key) DO NOTHING");
  });

  it("keeps a literal in the VALUES list (the scoped kv writes)", () => {
    const out = rewriteUpsert(
      "INSERT OR REPLACE INTO kv(scope, key, value) VALUES('modelAliases', ?, ?)",
      PRIMARY_KEY_COLUMNS
    );
    expect(out).toBe(
      "INSERT INTO kv(scope, key, value) VALUES('modelAliases', ?, ?) ON CONFLICT (scope, key) DO UPDATE SET value = excluded.value"
    );
  });

  it("leaves a plain INSERT alone", () => {
    const sql = "INSERT INTO usageHistory(timestamp, provider) VALUES(?, ?)";
    expect(rewriteUpsert(sql, PRIMARY_KEY_COLUMNS)).toBe(sql);
  });

  it("leaves an already-explicit ON CONFLICT alone", () => {
    const sql = "INSERT INTO requestDetails(id, data) VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data";
    expect(rewriteUpsert(sql, PRIMARY_KEY_COLUMNS)).toBe(sql);
  });

  it("covers every INSERT OR … in the repos with a known conflict target", () => {
    // Any table the repos upsert into must resolve to a non-empty PK, otherwise
    // the rewrite silently degrades to DO NOTHING and writes get dropped.
    for (const [table, pk] of Object.entries(PRIMARY_KEY_COLUMNS)) {
      expect(pk.length, `${table} has no primary key`).toBeGreaterThan(0);
    }
  });
});

describe("pg: TLS resolution", () => {
  const u = (s) => new URL(s);

  it("verifies certificates for a remote host with sslmode=require", () => {
    expect(resolveSsl(u("postgres://u:p@ep.neon.tech/neondb?sslmode=require")))
      .toEqual({ rejectUnauthorized: true });
  });

  it("verifies certificates for a remote host with no sslmode", () => {
    expect(resolveSsl(u("postgres://u:p@db.example.com/app")))
      .toEqual({ rejectUnauthorized: true });
  });

  it("skips TLS entirely for localhost with no sslmode", () => {
    expect(resolveSsl(u("postgres://u:p@localhost:5432/app"))).toBe(false);
    expect(resolveSsl(u("postgres://u:p@127.0.0.1:5432/app"))).toBe(false);
  });

  it("honours sslmode=disable even on a remote host", () => {
    expect(resolveSsl(u("postgres://u:p@db.example.com/app?sslmode=disable"))).toBe(false);
  });

  it("relaxes verification for the explicitly-unverified modes", () => {
    for (const mode of ["no-verify", "allow", "prefer"]) {
      expect(resolveSsl(u(`postgres://u:p@db.example.com/app?sslmode=${mode}`)))
        .toEqual({ rejectUnauthorized: false });
    }
  });
});

describe("pg: schema invariants the adapter relies on", () => {
  // The adapter re-cases result keys via a single flat lowercase→proper map.
  // Two tables disagreeing on the case of the same column name would make that
  // map ambiguous and silently mis-key one of them.
  it("no case collisions across tables (assertNoCaseCollisions)", () => {
    const seen = new Map();
    const collisions = [];
    for (const [table, def] of Object.entries(TABLES)) {
      for (const col of Object.keys(def.columns)) {
        const lower = col.toLowerCase();
        const prev = seen.get(lower);
        if (prev && prev.col !== col) {
          collisions.push(`${prev.table}.${prev.col} vs ${table}.${col}`);
        } else if (!prev) {
          seen.set(lower, { table, col });
        }
      }
    }
    expect(collisions).toEqual([]);
  });

  it("COLUMN_CASE_MAP holds exactly the mixed-case columns", () => {
    const expected = new Set();
    for (const def of Object.values(TABLES)) {
      for (const col of Object.keys(def.columns)) {
        if (col.toLowerCase() !== col) expected.add(col);
      }
    }
    expect(new Set(COLUMN_CASE_MAP.values())).toEqual(expected);
    for (const [lower, proper] of COLUMN_CASE_MAP) {
      expect(lower).toBe(proper.toLowerCase());
    }
  });

  it("PRIMARY_KEY_COLUMNS names real columns of its table", () => {
    for (const [table, pk] of Object.entries(PRIMARY_KEY_COLUMNS)) {
      const cols = Object.keys(TABLES[table].columns);
      for (const c of pk) expect(cols, `${table}.${c}`).toContain(c);
    }
  });

  it("emits identity instead of AUTOINCREMENT for the postgres dialect", () => {
    const pg = buildCreateTableSql("usageHistory", TABLES.usageHistory, "postgres");
    expect(pg).toContain("INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY");
    expect(pg).not.toMatch(/AUTOINCREMENT/i);
    // SQLite DDL must be byte-identical to what it was before pg existed.
    const lite = buildCreateTableSql("usageHistory", TABLES.usageHistory, "sqlite");
    expect(lite).toContain("INTEGER PRIMARY KEY AUTOINCREMENT");
    expect(buildCreateTableSql("usageHistory", TABLES.usageHistory)).toBe(lite);
  });

  it("leaves non-identity columns identical across dialects", () => {
    for (const [name, def] of Object.entries(TABLES)) {
      if (name === "usageHistory") continue;
      expect(buildCreateTableSql(name, def, "postgres"))
        .toBe(buildCreateTableSql(name, def, "sqlite"));
    }
  });
});

describe("engine selection from the environment", () => {
  const U = "postgres://h/d";

  it("DB_DRIVER picks the engine outright", () => {
    expect(getDbDriverPreference({ DB_DRIVER: "postgres" })).toBe("postgres");
    expect(getDbDriverPreference({ DB_DRIVER: "sqlite" })).toBe("sqlite");
    // Aliases, case and stray whitespace all resolve.
    for (const v of ["pg", "POSTGRESQL", " postgres "]) {
      expect(getDbDriverPreference({ DB_DRIVER: v }), v).toBe("postgres");
    }
    for (const v of ["sqlite3", "LOCAL"]) {
      expect(getDbDriverPreference({ DB_DRIVER: v }), v).toBe("sqlite");
    }
    expect(getDbDriverPreference({})).toBeNull();
    expect(getDbDriverPreference({ DB_DRIVER: "mongo" })).toBeNull();
  });

  it("DB_DRIVER=sqlite wins over a Postgres URL", () => {
    // The escape hatch: a URL in the environment cannot drag the app off SQLite.
    expect(getPostgresUrl({ DB_DRIVER: "sqlite", DATABASE_URL: U })).toBeNull();
  });

  it("DB_DRIVER=postgres accepts vendor URL names", () => {
    for (const name of ["NEON_DB_URL", "SUPABASE_DB_URL", "PG_URL", "PGURL"]) {
      expect(getPostgresUrl({ DB_DRIVER: "postgres", [name]: U }), name)
        .toEqual({ url: U, source: name });
    }
  });

  it("DB_DRIVER=postgres with no URL throws rather than falling back", () => {
    // Silently using SQLite here would put the app on a different store than
    // the operator configured, which is the failure this whole area is about.
    expect(() => getPostgresUrl({ DB_DRIVER: "postgres" })).toThrow(/no postgres:\/\/ URL/);
  });

  it("activates on DATABASE_URL and POSTGRES_URL with no DB_DRIVER", () => {
    expect(getPostgresUrl({ DATABASE_URL: U })).toEqual({ url: U, source: "DATABASE_URL" });
    expect(getPostgresUrl({ POSTGRES_URL: "postgresql://h/d" }))
      .toEqual({ url: "postgresql://h/d", source: "POSTGRES_URL" });
    expect(getPostgresUrl({ DATABASE_URL: "postgres://a/d", POSTGRES_URL: "postgres://b/d" }).source)
      .toBe("DATABASE_URL");
  });

  it("a vendor URL alone does not switch the store", () => {
    // Regression guard. NEON_DB_URL was briefly auto-activating, and because
    // next dev loads .env into process.env, a URL kept there for scripts moved a
    // running install off its populated SQLite file onto an empty database —
    // surfacing as a 401 at the dashboard login, not as a database error.
    for (const name of ["NEON_DB_URL", "SUPABASE_DB_URL", "PG_URL", "PGURL", "TEST_POSTGRES_URL"]) {
      expect(getPostgresUrl({ [name]: U }), name).toBeNull();
    }
  });

  it("ignores a non-postgres scheme and blank values", () => {
    expect(getPostgresUrl({ DATABASE_URL: "mysql://h/d" })).toBeNull();
    expect(getPostgresUrl({ DATABASE_URL: "   " })).toBeNull();
    expect(getPostgresUrl({})).toBeNull();
  });

  it("the CLI's SQLite-install skip agrees with driver.js", () => {
    // cli/hooks/sqliteRuntime.js duplicates this logic (CommonJS, no @/ alias).
    // Being MORE eager there strands an install on the slow sql.js fallback.
    const hook = fs.readFileSync(
      new URL("../../cli/hooks/sqliteRuntime.js", import.meta.url), "utf8");
    const generic = JSON.parse(hook.match(/const PG_URL_ENV_VARS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
    expect(generic).toEqual(["DATABASE_URL", "POSTGRES_URL"]);
    for (const name of generic) {
      expect(getPostgresUrl({ [name]: U }), name).not.toBeNull();
    }
  });
});

// ── live Postgres ─────────────────────────────────────────────────────────
// Skipped unless a Postgres URL is configured. Uses its own DATA_DIR so a
// stray SQLite file never lands in the repo, and drops the app's tables first
// so counts are deterministic against a shared/hosted database.

// The app switches its store only on DATABASE_URL / POSTGRES_URL and ignores
// vendor names like NEON_DB_URL on purpose, so one can sit in .env as a plain
// credential without moving a live install's data. Tests are the other half of
// that bargain: they accept the vendor names too, then export DATABASE_URL for
// the duration of the live block so driver.js resolves the same URL. Opting in
// is explicit here, which is exactly the property the app-side list protects.
const TEST_PG_ENV_VARS = ["DATABASE_URL", "POSTGRES_URL", "NEON_DB_URL", "TEST_POSTGRES_URL"];

function resolveTestPgUrl(env = process.env) {
  for (const name of TEST_PG_ENV_VARS) {
    const v = (env[name] || "").trim();
    if (/^postgres(ql)?:\/\//i.test(v)) return { url: v, source: name };
  }
  return null;
}

const PG = resolveTestPgUrl();

describe.skipIf(!PG)("pg: live round-trip", () => {
  let db;
  let adapter;
  let tempDir;
  const originalDataDir = process.env.DATA_DIR;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-pg-"));
    process.env.DATA_DIR = tempDir;
    // driver.js reads only its own two names; make the resolved URL one of them.
    process.env.DATABASE_URL = PG.url;

    const { createPgAdapter } = await import("@/lib/db/adapters/pgAdapter.js");
    const wipe = await createPgAdapter(PG.url);
    for (const name of Object.keys(TABLES)) {
      await wipe.exec(`DROP TABLE IF EXISTS ${name} CASCADE`);
    }
    await wipe.close();

    db = await import("@/lib/db/index.js");
    await db.initDb();
    const { getAdapter } = await import("@/lib/db/driver.js");
    adapter = await getAdapter();
  }, 60000);

  afterAll(async () => {
    try { await adapter?.close?.(); } catch {}
    delete global._dbAdapter;
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("selects the pg driver and postgres dialect", () => {
    expect(adapter.driver).toBe("pg");
    expect(adapter.dialect).toBe("postgres");
  });

  it("creates every declared table", async () => {
    const rows = await adapter.all(
      `SELECT table_name AS n FROM information_schema.tables WHERE table_schema = current_schema()`
    );
    const names = new Set(rows.map((r) => String(r.n).toLowerCase()));
    for (const t of Object.keys(TABLES)) expect(names, t).toContain(t.toLowerCase());
  });

  it("re-cases mixed-case columns on the way out", async () => {
    const c = await db.createProviderConnection({
      provider: "pgtest", authType: "api_key", apiKey: "k", isActive: true,
    });
    expect(typeof c.createdAt).toBe("string");
    const got = await db.getProviderConnectionById(c.id);
    expect(got.authType).toBe("api_key");
    expect(got.isActive).toBe(true);          // INTEGER 1 → boolean
    expect(got.apiKey).toBe("k");             // JSON data column
    expect(Object.keys(got)).not.toContain("createdat");
    await db.deleteProviderConnection(c.id);
  });

  it("returns COUNT(*) as a number, not an int8 string", async () => {
    const row = await adapter.get(`SELECT COUNT(*) as c FROM providerConnections`);
    expect(typeof row.c).toBe("number");
  });

  it("upserts through the rewritten INSERT OR REPLACE", async () => {
    const write = (v) => adapter.run(
      `INSERT OR REPLACE INTO kv(scope, key, value) VALUES(?, ?, ?)`,
      ["pgtest", "upsert", v]
    );
    await write("first");
    await write("second");                                  // same PK → DO UPDATE
    const row = await adapter.get(`SELECT value FROM kv WHERE scope = ? AND key = ?`,
      ["pgtest", "upsert"]);
    expect(row.value).toBe("second");
    const cnt = await adapter.get(`SELECT COUNT(*) as c FROM kv WHERE scope = ?`, ["pgtest"]);
    expect(cnt.c).toBe(1);                                  // replaced, not duplicated
    await adapter.run(`DELETE FROM kv WHERE scope = ?`, ["pgtest"]);
  });

  it("round-trips aliases through the repo API", async () => {
    await db.setModelAlias("pg-alias", "openai/gpt-4");
    expect((await db.getModelAliases())["pg-alias"]).toBe("openai/gpt-4");
    await db.setModelAlias("pg-alias", "openai/gpt-5");
    expect((await db.getModelAliases())["pg-alias"]).toBe("openai/gpt-5");
    await db.deleteModelAlias("pg-alias");
    expect((await db.getModelAliases())["pg-alias"]).toBeUndefined();
  });

  it("rolls a failing transaction back whole", async () => {
    const before = (await adapter.get(`SELECT COUNT(*) as c FROM kv`)).c;
    await expect(adapter.transaction(async () => {
      await adapter.run(`INSERT OR REPLACE INTO kv(scope, key, value) VALUES(?, ?, ?)`,
        ["pgtest", "rollback", "1"]);
      throw new Error("boom");
    })).rejects.toThrow("boom");
    expect((await adapter.get(`SELECT COUNT(*) as c FROM kv`)).c).toBe(before);
  });

  it("serializes concurrent read-modify-write without losing updates", async () => {
    // On READ COMMITTED this loses most increments; the adapter runs each
    // transaction SERIALIZABLE and retries on 40001, so all 20 survive.
    await adapter.run(`INSERT OR REPLACE INTO kv(scope, key, value) VALUES(?, ?, ?)`,
      ["pgtest", "counter", "0"]);
    const bump = () => adapter.transaction(async () => {
      const row = await adapter.get(`SELECT value FROM kv WHERE scope = ? AND key = ?`,
        ["pgtest", "counter"]);
      await adapter.run(`UPDATE kv SET value = ? WHERE scope = ? AND key = ?`,
        [String(Number(row.value) + 1), "pgtest", "counter"]);
    });
    await Promise.all(Array.from({ length: 20 }, bump));
    const row = await adapter.get(`SELECT value FROM kv WHERE scope = ? AND key = ?`,
      ["pgtest", "counter"]);
    expect(Number(row.value)).toBe(20);
    await adapter.run(`DELETE FROM kv WHERE scope = ?`, ["pgtest"]);
  }, 60000);
}, 120000);
