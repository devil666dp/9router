// P2 — encryption at rest for DB secrets.
// Covers: the AES-256-GCM envelope helper, the four repos that hold secrets,
// exportDb/importDb round-trips, read-through of legacy plaintext rows, and the
// versioned migration that rewrites existing rows.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const TEST_KEY = "a".repeat(64); // 32 bytes as hex
const OTHER_KEY = "b".repeat(64);

let tempDir;
const originalDataDir = process.env.DATA_DIR;
const originalCryptoKey = process.env.DB_ENCRYPTION_KEY;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-enc-"));
  process.env.DATA_DIR = tempDir;
  process.env.DB_ENCRYPTION_KEY = TEST_KEY;
  delete global._dbAdapter;
  vi.resetModules();
});

afterEach(() => {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
  if (originalCryptoKey === undefined) delete process.env.DB_ENCRYPTION_KEY;
  else process.env.DB_ENCRYPTION_KEY = originalCryptoKey;
});

// ─────────────────────────── helper (pure) ───────────────────────────

describe("secretCrypto helper", () => {
  it("is a no-op passthrough when DB_ENCRYPTION_KEY is unset", async () => {
    delete process.env.DB_ENCRYPTION_KEY;
    const c = await import("@/lib/db/helpers/secretCrypto.js");
    expect(c.isEncryptionEnabled()).toBe(false);
    expect(c.encryptColumn('{"accessToken":"secret"}')).toBe('{"accessToken":"secret"}');
    expect(c.decryptColumn('{"accessToken":"secret"}')).toBe('{"accessToken":"secret"}');
  });

  it("seals into a versioned {v,iv,tag,ct} envelope that hides the plaintext", async () => {
    const c = await import("@/lib/db/helpers/secretCrypto.js");
    expect(c.isEncryptionEnabled()).toBe(true);
    const sealed = c.encryptColumn('{"accessToken":"ya29.super-secret"}');
    expect(sealed).not.toContain("ya29");
    expect(sealed).not.toContain("accessToken");
    const env = JSON.parse(sealed);
    expect(Object.keys(env).sort()).toEqual(["ct", "iv", "tag", "v"]);
    expect(env.v).toBe(1);
    expect(c.isEncryptedValue(sealed)).toBe(true);
    expect(c.decryptColumn(sealed)).toBe('{"accessToken":"ya29.super-secret"}');
  });

  it("blob sealing is non-deterministic (random IV) but both decrypt", async () => {
    const c = await import("@/lib/db/helpers/secretCrypto.js");
    const a = c.encryptColumn("same-input");
    const b = c.encryptColumn("same-input");
    expect(a).not.toBe(b);
    expect(c.decryptColumn(a)).toBe("same-input");
    expect(c.decryptColumn(b)).toBe("same-input");
  });

  it("lookup sealing is deterministic so equality queries and UNIQUE survive", async () => {
    const c = await import("@/lib/db/helpers/secretCrypto.js");
    const a = c.encryptLookupColumn("sk-machine-abc123-deadbeef");
    const b = c.encryptLookupColumn("sk-machine-abc123-deadbeef");
    expect(a).toBe(b);
    expect(a).not.toContain("sk-");
    expect(c.decryptColumn(a)).toBe("sk-machine-abc123-deadbeef");
    // distinct plaintexts must not collide
    expect(c.encryptLookupColumn("sk-other")).not.toBe(a);
  });

  it("reads through values that are still plaintext", async () => {
    const c = await import("@/lib/db/helpers/secretCrypto.js");
    expect(c.decryptColumn('{"apiKey":"legacy"}')).toBe('{"apiKey":"legacy"}');
    expect(c.decryptColumn("sk-legacy-plain")).toBe("sk-legacy-plain");
    expect(c.isEncryptedValue('{"apiKey":"legacy"}')).toBe(false);
  });

  it("never double-wraps an already sealed value", async () => {
    const c = await import("@/lib/db/helpers/secretCrypto.js");
    const once = c.encryptColumn("payload");
    expect(c.encryptColumn(once)).toBe(once);
  });

  it("throws when an envelope is found but no key is configured", async () => {
    const c = await import("@/lib/db/helpers/secretCrypto.js");
    const sealed = c.encryptColumn("payload");
    delete process.env.DB_ENCRYPTION_KEY;
    c.resetSecretCryptoCache();
    expect(() => c.decryptColumn(sealed)).toThrow(/DB_ENCRYPTION_KEY/);
  });

  it("throws on the wrong key and on tampered ciphertext", async () => {
    const c = await import("@/lib/db/helpers/secretCrypto.js");
    const sealed = c.encryptColumn("payload");

    process.env.DB_ENCRYPTION_KEY = OTHER_KEY;
    c.resetSecretCryptoCache();
    expect(() => c.decryptColumn(sealed)).toThrow(/decrypt/i);

    process.env.DB_ENCRYPTION_KEY = TEST_KEY;
    c.resetSecretCryptoCache();
    const env = JSON.parse(sealed);
    const ct = Buffer.from(env.ct, "base64");
    ct[0] ^= 0xff;
    env.ct = ct.toString("base64");
    expect(() => c.decryptColumn(JSON.stringify(env))).toThrow(/decrypt/i);
  });

  it("accepts a base64 32-byte key and a passphrase", async () => {
    const c = await import("@/lib/db/helpers/secretCrypto.js");
    for (const raw of [Buffer.alloc(32, 7).toString("base64"), "a long human passphrase"]) {
      process.env.DB_ENCRYPTION_KEY = raw;
      c.resetSecretCryptoCache();
      expect(c.isEncryptionEnabled()).toBe(true);
      expect(c.decryptColumn(c.encryptColumn("round-trip"))).toBe("round-trip");
    }
  });
});

// ─────────────────────────── repos ───────────────────────────

async function rawCol(table, id, col = "data") {
  const { getAdapter } = await import("@/lib/db/driver.js");
  const db = await getAdapter();
  const row = await db.get(`SELECT ${col} FROM ${table} WHERE id = ?`, [id]);
  return row?.[col];
}

describe("repos encrypt secrets at rest", () => {
  it("providerConnections: tokens are sealed in the data column", async () => {
    const repo = await import("@/lib/db/repos/connectionsRepo.js");
    const created = await repo.createProviderConnection({
      provider: "gemini", authType: "oauth", email: "a@b.c",
      accessToken: "ya29.ACCESS-TOKEN", refreshToken: "1//REFRESH-TOKEN",
      providerSpecificData: { projectId: "p-1" },
    });

    const raw = await rawCol("providerConnections", created.id);
    expect(raw).not.toContain("ya29.ACCESS-TOKEN");
    expect(raw).not.toContain("1//REFRESH-TOKEN");
    expect(raw).not.toContain("accessToken");

    const read = await repo.getProviderConnectionById(created.id);
    expect(read.accessToken).toBe("ya29.ACCESS-TOKEN");
    expect(read.refreshToken).toBe("1//REFRESH-TOKEN");
    expect(read.providerSpecificData).toEqual({ projectId: "p-1" });

    const all = await repo.getProviderConnections();
    expect(all.find(c => c.id === created.id).accessToken).toBe("ya29.ACCESS-TOKEN");
  });

  it("providerConnections: update re-seals and merges (token refresh path)", async () => {
    const repo = await import("@/lib/db/repos/connectionsRepo.js");
    const c = await repo.createProviderConnection({ provider: "gemini", authType: "oauth", accessToken: "OLD" });
    await repo.updateProviderConnection(c.id, { accessToken: "NEW-ACCESS", lastRefreshAt: "now" });

    const raw = await rawCol("providerConnections", c.id);
    expect(raw).not.toContain("NEW-ACCESS");
    const read = await repo.getProviderConnectionById(c.id);
    expect(read.accessToken).toBe("NEW-ACCESS");
    expect(read.lastRefreshAt).toBe("now");
  });

  it("providerNodes: apiKey is sealed in the data column", async () => {
    const repo = await import("@/lib/db/repos/nodesRepo.js");
    const node = await repo.createProviderNode({ type: "custom", name: "n1", apiKey: "NODE-API-KEY", baseUrl: "http://x" });
    expect(await rawCol("providerNodes", node.id)).not.toContain("NODE-API-KEY");
    const read = await repo.getProviderNodeById(node.id);
    expect(read.apiKey).toBe("NODE-API-KEY");
    expect(read.baseUrl).toBe("http://x");

    await repo.updateProviderNode(node.id, { apiKey: "ROTATED" });
    expect(await rawCol("providerNodes", node.id)).not.toContain("ROTATED");
    expect((await repo.getProviderNodeById(node.id)).apiKey).toBe("ROTATED");
  });

  it("proxyPools: credentialed proxy URL is sealed in the data column", async () => {
    const repo = await import("@/lib/db/repos/proxyPoolsRepo.js");
    const pool = await repo.createProxyPool({ name: "p", proxyUrl: "http://user:pa55word@proxy.example:8080" });
    const raw = await rawCol("proxyPools", pool.id);
    expect(raw).not.toContain("pa55word");
    expect(raw).not.toContain("proxy.example");
    expect((await repo.getProxyPoolById(pool.id)).proxyUrl).toBe("http://user:pa55word@proxy.example:8080");
    expect((await repo.getProxyPools()).find(p => p.id === pool.id).proxyUrl).toBe("http://user:pa55word@proxy.example:8080");
  });

  it("apiKeys: key column is sealed but validation and listing still work", async () => {
    const repo = await import("@/lib/db/repos/apiKeysRepo.js");
    const created = await repo.createApiKey("k1", "machineid00000001");
    expect(created.key.startsWith("sk-")).toBe(true);

    const raw = await rawCol("apiKeys", created.id, "key");
    expect(raw).not.toBe(created.key);
    expect(raw).not.toContain("sk-");

    expect((await repo.getApiKeys())[0].key).toBe(created.key);
    expect((await repo.getApiKeyById(created.id)).key).toBe(created.key);
    expect(await repo.validateApiKey(created.key)).toBe(true);
    expect(await repo.validateApiKey("sk-not-a-real-key")).toBe(false);
  });

  it("apiKeys: rename keeps the key sealed and still valid", async () => {
    const repo = await import("@/lib/db/repos/apiKeysRepo.js");
    const created = await repo.createApiKey("k1", "machineid00000001");
    await repo.updateApiKey(created.id, { name: "renamed" });
    expect(await rawCol("apiKeys", created.id, "key")).not.toContain("sk-");
    expect(await repo.validateApiKey(created.key)).toBe(true);
    expect((await repo.getApiKeyById(created.id)).name).toBe("renamed");
  });

  it("deactivated keys still fail validation when sealed", async () => {
    const repo = await import("@/lib/db/repos/apiKeysRepo.js");
    const created = await repo.createApiKey("k1", "machineid00000001");
    await repo.updateApiKey(created.id, { isActive: false });
    expect(await repo.validateApiKey(created.key)).toBe(false);
  });
});

// ───────────────────── legacy plaintext read-through ─────────────────────

describe("legacy plaintext rows", () => {
  it("are readable, and are sealed on next write", async () => {
    const { getAdapter } = await import("@/lib/db/driver.js");
    const db = await getAdapter();
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO providerConnections(id, provider, authType, name, email, priority, isActive, data, createdAt, updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      ["legacy-1", "gemini", "oauth", null, null, null, 1, '{"accessToken":"PLAIN-TOKEN"}', now, now]
    );
    await db.run(
      `INSERT INTO apiKeys(id, key, name, machineId, isActive, createdAt) VALUES(?,?,?,?,?,?)`,
      ["legacy-key", "sk-plain-legacy-key", "old", "m", 1, now]
    );

    const conns = await import("@/lib/db/repos/connectionsRepo.js");
    expect((await conns.getProviderConnectionById("legacy-1")).accessToken).toBe("PLAIN-TOKEN");

    const keys = await import("@/lib/db/repos/apiKeysRepo.js");
    expect((await keys.getApiKeyById("legacy-key")).key).toBe("sk-plain-legacy-key");
    expect(await keys.validateApiKey("sk-plain-legacy-key")).toBe(true);

    // next write upgrades the row in place
    await conns.updateProviderConnection("legacy-1", { lastError: null });
    expect(await rawCol("providerConnections", "legacy-1")).not.toContain("PLAIN-TOKEN");
    await keys.updateApiKey("legacy-key", { name: "renamed" });
    expect(await rawCol("apiKeys", "legacy-key", "key")).not.toContain("sk-plain");
    expect(await keys.validateApiKey("sk-plain-legacy-key")).toBe(true);
  });
});

// ───────────────────── export / import ─────────────────────

describe("exportDb / importDb", () => {
  it("exports plaintext and re-seals on import", async () => {
    const conns = await import("@/lib/db/repos/connectionsRepo.js");
    const keysRepo = await import("@/lib/db/repos/apiKeysRepo.js");
    const pools = await import("@/lib/db/repos/proxyPoolsRepo.js");
    const nodes = await import("@/lib/db/repos/nodesRepo.js");
    const { exportDb, importDb } = await import("@/lib/db/index.js");

    const conn = await conns.createProviderConnection({ provider: "gemini", authType: "oauth", accessToken: "EXPORT-TOKEN" });
    const key = await keysRepo.createApiKey("k", "machineid00000001");
    const pool = await pools.createProxyPool({ proxyUrl: "http://u:PROXYPASS@h:1" });
    const node = await nodes.createProviderNode({ type: "custom", apiKey: "NODEKEY" });

    const dump = await exportDb();
    expect(dump.providerConnections.find(c => c.id === conn.id).accessToken).toBe("EXPORT-TOKEN");
    expect(dump.apiKeys.find(k => k.id === key.id).key).toBe(key.key);
    expect(dump.proxyPools.find(p => p.id === pool.id).proxyUrl).toBe("http://u:PROXYPASS@h:1");
    expect(dump.providerNodes.find(n => n.id === node.id).apiKey).toBe("NODEKEY");

    await importDb(dump);

    expect(await rawCol("providerConnections", conn.id)).not.toContain("EXPORT-TOKEN");
    expect(await rawCol("apiKeys", key.id, "key")).not.toContain("sk-");
    expect(await rawCol("proxyPools", pool.id)).not.toContain("PROXYPASS");
    expect(await rawCol("providerNodes", node.id)).not.toContain("NODEKEY");

    expect((await conns.getProviderConnectionById(conn.id)).accessToken).toBe("EXPORT-TOKEN");
    expect(await keysRepo.validateApiKey(key.key)).toBe(true);
    expect((await pools.getProxyPoolById(pool.id)).proxyUrl).toBe("http://u:PROXYPASS@h:1");
  });

  it("imports a plaintext backup taken before encryption was enabled", async () => {
    const { importDb } = await import("@/lib/db/index.js");
    const conns = await import("@/lib/db/repos/connectionsRepo.js");
    const payload = {
      settings: { theme: "dark" },
      providerConnections: [{ id: "p1", provider: "gemini", authType: "oauth", accessToken: "OLD-BACKUP-TOKEN" }],
      apiKeys: [{ id: "k1", key: "sk-old-backup-key", name: "n", machineId: "m", isActive: true }],
    };
    await importDb(payload);
    expect(await rawCol("providerConnections", "p1")).not.toContain("OLD-BACKUP-TOKEN");
    expect((await conns.getProviderConnectionById("p1")).accessToken).toBe("OLD-BACKUP-TOKEN");
    const keysRepo = await import("@/lib/db/repos/apiKeysRepo.js");
    expect(await keysRepo.validateApiKey("sk-old-backup-key")).toBe(true);
  });
});

// ───────────────────── migration ─────────────────────

describe("migration 002 (encrypt existing rows)", () => {
  it("seals rows written before the key existed, on the next boot with a key", async () => {
    // 1st boot: no key → plaintext at rest
    delete process.env.DB_ENCRYPTION_KEY;
    const { getAdapter } = await import("@/lib/db/driver.js");
    const conns = await import("@/lib/db/repos/connectionsRepo.js");
    const keysRepo = await import("@/lib/db/repos/apiKeysRepo.js");
    const db = await getAdapter();
    const conn = await conns.createProviderConnection({ provider: "gemini", authType: "oauth", accessToken: "PREKEY-TOKEN" });
    const key = await keysRepo.createApiKey("k", "machineid00000001");
    expect((await db.get(`SELECT data FROM providerConnections WHERE id = ?`, [conn.id])).data).toContain("PREKEY-TOKEN");

    // pretend this install predates the encryption schema version
    await db.run(`UPDATE _meta SET value = '1' WHERE key = 'schemaVersion'`);
    await db.close?.();

    // 2nd boot: key present → migration rewrites existing rows
    delete global._dbAdapter;
    vi.resetModules();
    process.env.DB_ENCRYPTION_KEY = TEST_KEY;
    const { getAdapter: getAdapter2 } = await import("@/lib/db/driver.js");
    const db2 = await getAdapter2();
    const raw = (await db2.get(`SELECT data FROM providerConnections WHERE id = ?`, [conn.id])).data;
    expect(raw).not.toContain("PREKEY-TOKEN");
    const rawKey = (await db2.get(`SELECT key FROM apiKeys WHERE id = ?`, [key.id])).key;
    expect(rawKey).not.toContain("sk-");

    const conns2 = await import("@/lib/db/repos/connectionsRepo.js");
    const keys2 = await import("@/lib/db/repos/apiKeysRepo.js");
    expect((await conns2.getProviderConnectionById(conn.id)).accessToken).toBe("PREKEY-TOKEN");
    expect(await keys2.validateApiKey(key.key)).toBe(true);
  });

  it("leaves rows alone when no key is configured", async () => {
    delete process.env.DB_ENCRYPTION_KEY;
    const { getAdapter } = await import("@/lib/db/driver.js");
    const conns = await import("@/lib/db/repos/connectionsRepo.js");
    const db = await getAdapter();
    const conn = await conns.createProviderConnection({ provider: "gemini", authType: "oauth", accessToken: "STAYS-PLAIN" });
    await db.run(`UPDATE _meta SET value = '1' WHERE key = 'schemaVersion'`);
    await db.close?.();

    delete global._dbAdapter;
    vi.resetModules();
    const { getAdapter: getAdapter2 } = await import("@/lib/db/driver.js");
    const db2 = await getAdapter2();
    expect((await db2.get(`SELECT data FROM providerConnections WHERE id = ?`, [conn.id])).data).toContain("STAYS-PLAIN");
  });
});
