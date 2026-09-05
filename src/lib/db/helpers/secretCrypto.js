// Envelope encryption for the secret-bearing DB columns (P2: encryption at rest).
//
// What is protected: the JSON `data` blobs of providerConnections / providerNodes /
// proxyPools (OAuth access+refresh tokens, provider API keys, proxy URLs with
// embedded credentials) and the `apiKeys.key` column (gateway `sk-…` keys).
//
// Threat model — read this before assuming more safety than there is. The master
// key comes from the DB_ENCRYPTION_KEY env var on the same host as the database,
// so this defeats OFFLINE attacks: a stolen SQLite file, a leaked Postgres dump,
// a misplaced backup, a `GET /api/settings/database` export from disk. It does
// NOT defend against an attacker who can run code in this process — they can read
// process.env too. That is the standard trade-off short of a KMS/HSM.
//
// Format: a JSON envelope `{v, iv, tag, ct}` (base64 fields) so the scheme can be
// rotated later without guessing at old rows. Values that are not envelopes are
// read through untouched, so an existing plaintext install keeps working and
// upgrades lazily on each write.
import crypto from "node:crypto";

const ENV_VAR = "DB_ENCRYPTION_KEY";
const ENVELOPE_VERSION = 1;
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

// Fixed, non-secret domain separators. Changing any of these invalidates existing
// rows, so they are versioned instead of edited.
const SCRYPT_SALT = "9router.db.secretCrypto.v1";
const LABEL_DATA = "9router.db.secretCrypto.data.v1";
const LABEL_IV = "9router.db.secretCrypto.det-iv.v1";

// Cached subkeys, keyed on the raw env string so a test (or a rotation) that
// swaps DB_ENCRYPTION_KEY is picked up without a restart.
let cache = null;

function rawEnvKey() {
  const v = process.env[ENV_VAR];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

// Accept the three shapes an operator is likely to paste: 64 hex chars, a base64
// (or base64url) encoding of exactly 32 bytes, or an arbitrary passphrase, which
// is stretched with scrypt rather than truncated.
function masterFromRaw(raw) {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  if (/^[A-Za-z0-9+/_-]{43}=?$/.test(raw)) {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === 32) return decoded;
  }
  return crypto.scryptSync(raw, SCRYPT_SALT, 32);
}

// HMAC-based subkey derivation rather than crypto.hkdfSync: hkdfSync is missing /
// differs across some of the runtimes this ships on (Bun, older Node), and the
// driver chain means we cannot assume which one we are on.
function subkey(master, label) {
  return crypto.createHmac("sha256", master).update(label).digest();
}

function keys() {
  const raw = rawEnvKey();
  if (!raw) {
    cache = null;
    return null;
  }
  if (cache && cache.raw === raw) return cache;
  const master = masterFromRaw(raw);
  cache = { raw, dataKey: subkey(master, LABEL_DATA), ivKey: subkey(master, LABEL_IV) };
  return cache;
}

export function isEncryptionEnabled() {
  return keys() !== null;
}

// Test seam: drop the derived-key cache after mutating process.env.
export function resetSecretCryptoCache() {
  cache = null;
}

// True only for our own envelope. Plaintext `data` columns are also JSON objects,
// so the shape has to be checked exactly rather than by a leading "{".
export function isEncryptedValue(value) {
  if (typeof value !== "string") return false;
  if (!value.trimStart().startsWith("{")) return false;
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const fields = Object.keys(parsed);
  if (fields.length !== 4) return false;
  return typeof parsed.v === "number" && typeof parsed.iv === "string"
    && typeof parsed.tag === "string" && typeof parsed.ct === "string";
}

function seal(plaintext, iv, dataKey) {
  const cipher = crypto.createCipheriv(ALGO, dataKey, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return JSON.stringify({
    v: ENVELOPE_VERSION,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ct: ct.toString("base64"),
  });
}

// Random IV — for opaque blobs that are only ever fetched by row id.
export function encryptColumn(plaintext) {
  if (typeof plaintext !== "string") return plaintext;
  const k = keys();
  if (!k) return plaintext;
  if (isEncryptedValue(plaintext)) return plaintext;
  return seal(plaintext, crypto.randomBytes(IV_BYTES), k.dataKey);
}

// Deterministic (SIV-style) IV — for columns that are looked up BY VALUE.
// `validateApiKey` runs `WHERE key = ?` on every gateway request and the column
// carries a UNIQUE constraint; a random IV would turn both into a full-table
// decrypt-and-compare. Deriving the IV from the plaintext under a separate subkey
// keeps the lookup a single indexed hit and keeps duplicate keys colliding as
// before. The cost is the usual deterministic-encryption leak: equal plaintexts
// produce equal ciphertexts, so a dump reveals which rows share a key. For 32-byte
// random gateway keys that is acceptable; do not reuse this for low-entropy values.
export function encryptLookupColumn(plaintext) {
  if (typeof plaintext !== "string") return plaintext;
  const k = keys();
  if (!k) return plaintext;
  if (isEncryptedValue(plaintext)) return plaintext;
  const iv = crypto.createHmac("sha256", k.ivKey).update(plaintext).digest().subarray(0, IV_BYTES);
  return seal(plaintext, iv, k.dataKey);
}

export function decryptColumn(value) {
  if (typeof value !== "string") return value;
  if (!isEncryptedValue(value)) return value; // read-through: still plaintext
  const k = keys();
  if (!k) {
    throw new Error(`[DB] found an encrypted column but ${ENV_VAR} is not set — set it to the key this database was written with, or restore an unencrypted backup`);
  }
  const env = JSON.parse(value);
  if (env.v !== ENVELOPE_VERSION) {
    throw new Error(`[DB] unsupported encrypted column version ${env.v} (this build understands v${ENVELOPE_VERSION})`);
  }
  try {
    const decipher = crypto.createDecipheriv(ALGO, k.dataKey, Buffer.from(env.iv, "base64"));
    decipher.setAuthTag(Buffer.from(env.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(env.ct, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error(`[DB] failed to decrypt a column — wrong ${ENV_VAR} or the row is corrupted`);
  }
}

// Candidate ciphertexts for an equality lookup on an encrypted column. Includes
// the bare plaintext so rows that have not been rewritten yet still match.
export function keyLookupCandidates(plaintext) {
  if (typeof plaintext !== "string" || !isEncryptionEnabled()) return [plaintext];
  return [encryptLookupColumn(plaintext), plaintext];
}
