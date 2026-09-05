// Rewrite existing secret columns into the encrypted envelope (P2).
//
// Nothing about the table shapes changes — this is a data migration. It exists so
// that turning on DB_ENCRYPTION_KEY actually scrubs the plaintext an install has
// already accumulated, instead of only protecting rows written from then on.
//
// Reads never depend on this: every repo reads through plaintext values, and every
// write re-seals, so an install that skips or fails this migration still works and
// converges as rows are touched.
import { isEncryptionEnabled, isEncryptedValue, encryptColumn, encryptLookupColumn } from "../helpers/secretCrypto.js";

// Tables whose secrets live inside the opaque JSON `data` column.
const BLOB_TABLES = ["providerConnections", "providerNodes", "proxyPools"];

export default {
  version: 2,
  name: "encrypt-secrets",
  async up(db) {
    if (!isEncryptionEnabled()) return; // no key configured — rows stay plaintext

    // Postgres: skip the eager rewrite. migrate.js only takes a pre-change backup
    // for local SQLite files (the provider owns backups for a managed database), so
    // a bulk in-place rewrite here would have no snapshot to fall back on if the
    // key turned out to be wrong. Read-through + re-seal-on-write upgrades those
    // rows lazily instead, which is recoverable at every step.
    if (db.dialect === "postgres") {
      console.log("[DB][migrate] 002 encrypt-secrets: postgres → lazy upgrade on next write");
      return;
    }

    let sealed = 0;
    for (const table of BLOB_TABLES) {
      for (const row of await db.all(`SELECT id, data FROM ${table}`)) {
        if (typeof row.data !== "string" || isEncryptedValue(row.data)) continue;
        await db.run(`UPDATE ${table} SET data = ? WHERE id = ?`, [encryptColumn(row.data), row.id]);
        sealed++;
      }
    }
    for (const row of await db.all(`SELECT id, key FROM apiKeys`)) {
      if (typeof row.key !== "string" || isEncryptedValue(row.key)) continue;
      await db.run(`UPDATE apiKeys SET key = ? WHERE id = ?`, [encryptLookupColumn(row.key), row.id]);
      sealed++;
    }
    if (sealed > 0) console.log(`[DB][migrate] 002 encrypt-secrets: sealed ${sealed} row(s)`);
  },
};
