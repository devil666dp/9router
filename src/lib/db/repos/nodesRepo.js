import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

function rowToNode(row) {
  if (!row) return null;
  const extra = parseJson(row.data, {});
  return {
    ...extra,
    id: row.id,
    type: row.type,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function nodeToRow(n) {
  const { id, type, name, createdAt, updatedAt, ...rest } = n;
  return {
    id,
    type: type ?? null,
    name: name ?? null,
    data: stringifyJson(rest),
    createdAt,
    updatedAt,
  };
}

async function upsert(db, n) {
  const r = nodeToRow(n);
  await db.run(
    `INSERT INTO providerNodes(id, type, name, data, createdAt, updatedAt)
     VALUES(?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       type=excluded.type, name=excluded.name, data=excluded.data, updatedAt=excluded.updatedAt`,
    [r.id, r.type, r.name, r.data, r.createdAt, r.updatedAt]
  );
}

export async function getProviderNodes(filter = {}) {
  const db = await getAdapter();
  const where = [];
  const params = [];
  if (filter.type) { where.push("type = ?"); params.push(filter.type); }
  const sql = `SELECT * FROM providerNodes${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`;
  return (await db.all(sql, params)).map(rowToNode);
}

export async function getProviderNodeById(id) {
  const db = await getAdapter();
  return rowToNode(await db.get(`SELECT * FROM providerNodes WHERE id = ?`, [id]));
}

export async function createProviderNode(data) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  // A node's shape is open-ended: rowToNode spreads whatever sits in the JSON
  // `data` column back out, and updateProviderNode merges freely. So keep every
  // field the caller passed instead of an allow-list, which silently dropped
  // each newly added one (logoUrl, spec, requiresApiKey, ...) on create only.
  const { id, createdAt, updatedAt, ...rest } = data;
  const node = {
    ...rest,
    id: id || uuidv4(),
    createdAt: createdAt || now,
    updatedAt: now,
  };
  await upsert(db, node);
  return node;
}

export async function updateProviderNode(id, data) {
  const db = await getAdapter();
  // Returned from the callback rather than assigned to an outer variable: the
  // Postgres adapter re-runs the callback on a serialization failure, and an
  // outer assignment would survive the discarded attempt.
  return await db.transaction(async () => {
    const row = await db.get(`SELECT * FROM providerNodes WHERE id = ?`, [id]);
    if (!row) return null;
    const merged = { ...rowToNode(row), ...data, updatedAt: new Date().toISOString() };
    await upsert(db, merged);
    return merged;
  });
}

export async function deleteProviderNode(id) {
  const db = await getAdapter();
  let removed = null;
  await db.transaction(async () => {
    const row = await db.get(`SELECT * FROM providerNodes WHERE id = ?`, [id]);
    if (!row) return;
    removed = rowToNode(row);
    await db.run(`DELETE FROM providerNodes WHERE id = ?`, [id]);
  });
  return removed;
}
