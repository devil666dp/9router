// Bridge between the Postman-style form the dashboard shows and the flat recipe
// that gets stored.
//
// The form is the user's mental model: a URL, a method, a header table, one
// optional API key, and a body typed either as key/value rows or as raw JSON.
// The recipe is what run.js executes. Keeping the mapping here (rather than in a
// component) means the Add modal, the Edit modal and any future importer all
// agree on what a form field means, and none of them can drift.
//
// Browser-safe on purpose: pure data, no node imports.

import { TEMPLATE_VARS } from "./template.js";
import { collectPlaceholders, DEFAULTS } from "./spec.js";

/** Placeholders the request always supplies — never asked for in the form. */
export const AUTO_VARS = new Set([...TEMPLATE_VARS, "id"]);

export const BODY_MODES = ["fields", "json"];
export const SECOND_CALL_MODES = ["off", "poll", "stream"];
export const AUTH_MODES = ["bearer", "header", "none"];

/** A blank form, ready to type into. */
export function emptyForm() {
  return {
    name: "",
    prefix: "",
    // Identity only: the logo is stored on the node, never in the recipe.
    logoUrl: "",
    method: DEFAULTS.method,
    url: "",
    headers: [{ name: "Content-Type", value: DEFAULTS.contentType }],
    authMode: "bearer",
    authHeader: DEFAULTS.authHeader,
    bodyMode: "fields",
    bodyFields: [{ key: "", value: "" }],
    bodyJson: "",
    vars: [],
    textPath: "",
    // The second call. `secondCall` is off / "poll" / "stream"; the id from the
    // first reply is available to both as {id}.
    secondCall: "off",
    idPath: "",
    pollUrl: "",
    pollMethod: "GET",
    pollFields: [{ key: "", value: "" }],
    pollTextPath: "",
    pollStatusPath: "",
    pollDoneValues: "",
  };
}

function rowsToObject(rows) {
  const out = {};
  for (const row of rows || []) {
    const key = String(row?.name ?? row?.key ?? "").trim();
    if (!key) continue;
    out[key] = row.value ?? "";
  }
  return out;
}

function objectToRows(obj, keyName = "name") {
  return Object.entries(obj || {}).map(([key, value]) => ({
    [keyName]: key,
    value: typeof value === "object" ? JSON.stringify(value) : String(value ?? ""),
  }));
}

// A typed body row: "0.7" stays a number, "true" a boolean, "{prompt}" a
// placeholder (resolveTemplate types it later), "[1,2]" the array it looks like.
// Typing here rather than at send time means the stored recipe reads the way the
// user typed it, and an upstream that rejects "0.7" as a string still works.
function typeValue(raw) {
  const text = String(raw ?? "");
  const trimmed = text.trim();
  if (!trimmed) return text;
  if (/^\{[a-zA-Z0-9_.-]+\}$/.test(trimmed)) return trimmed;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (/^[[{]/.test(trimmed)) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return text;
    }
  }
  return text;
}

/** Form → recipe. Only fields the user actually filled in reach the recipe. */
export function formToSpec(form) {
  const f = { ...emptyForm(), ...(form || {}) };
  const headers = rowsToObject(f.headers);

  let body;
  if (f.bodyMode === "json") {
    const text = String(f.bodyJson || "").trim();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        // Not JSON: send it verbatim (a form-encoded or templated string body).
        body = text;
      }
    }
  } else {
    const fields = (f.bodyFields || []).filter((row) => String(row?.key ?? "").trim());
    if (fields.length) {
      body = {};
      for (const row of fields) body[String(row.key).trim()] = typeValue(row.value);
    }
  }

  const spec = {
    method: String(f.method || DEFAULTS.method).toUpperCase(),
    url: String(f.url || "").trim(),
    ...(Object.keys(headers).length ? { headers } : {}),
    auth: f.authMode === "none"
      ? "none"
      : f.authMode === "header"
        ? { header: String(f.authHeader || DEFAULTS.authHeader).trim(), scheme: "raw" }
        : { header: DEFAULTS.authHeader, scheme: "bearer" },
    ...(body !== undefined ? { body } : {}),
    ...(String(f.textPath || "").trim() ? { textPath: String(f.textPath).trim() } : {}),
  };

  const vars = rowsToObject(f.vars);
  if (Object.keys(vars).length) spec.vars = vars;

  if (f.secondCall !== "off" && String(f.pollUrl || "").trim()) {
    const streaming = f.secondCall === "stream";
    const method = String(f.pollMethod || "GET").toUpperCase();
    const doneValues = String(f.pollDoneValues || "")
      .split(",")
      .map((word) => word.trim())
      .filter(Boolean);

    // Only set when the user typed one: left blank, run.js finds the id itself
    // in the first reply (runId / id / requestid / …).
    const idPath = String(f.idPath || "").trim();
    if (idPath) spec.idPath = idPath;

    const pollBody = {};
    for (const row of f.pollFields || []) {
      const key = String(row?.key ?? "").trim();
      if (key) pollBody[key] = typeValue(row.value);
    }

    spec.poll = {
      mode: streaming ? "stream" : "poll",
      method,
      url: String(f.pollUrl).trim(),
      ...(method !== "GET" && Object.keys(pollBody).length ? { body: pollBody } : {}),
      ...(String(f.pollTextPath || "").trim() ? { textPath: String(f.pollTextPath).trim() } : {}),
      ...(!streaming && String(f.pollStatusPath || "").trim()
        ? { donePath: String(f.pollStatusPath).trim(), doneValues: doneValues.length ? doneValues : ["completed", "succeeded", "done"] }
        : {}),
      ...(streaming ? {} : { failValues: ["failed", "error", "cancelled", "canceled", "timeout"] }),
    };
  }

  return spec;
}

/** Recipe → form, so an existing node opens in the same UI that created it. */
export function specToForm(spec, { name = "", prefix = "", logoUrl = "" } = {}) {
  const base = emptyForm();
  if (!spec || typeof spec !== "object") return { ...base, name, prefix, logoUrl };

  // Recipes written by the first iteration nested everything under `create`.
  const create = spec.create && typeof spec.create === "object" ? spec.create : {};
  const url = spec.url ?? create.url ?? "";
  const method = spec.method ?? create.method ?? base.method;
  const rawBody = spec.body !== undefined ? spec.body : create.body;
  const poll = spec.poll && typeof spec.poll === "object" ? spec.poll : null;

  const headers = objectToRows(spec.headers);
  if (!headers.some((row) => /^content-type$/i.test(row.name))) {
    headers.unshift({ name: "Content-Type", value: DEFAULTS.contentType });
  }

  const auth = spec.auth;
  const authMode = auth === "none" || auth?.scheme === "none"
    ? "none"
    : auth?.scheme === "raw" ? "header" : "bearer";

  // A flat object of scalars is what the field table can round-trip; anything
  // nested opens in the JSON tab so no structure is silently flattened away.
  const flatScalars = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
    && Object.values(rawBody).every((v) => v === null || typeof v !== "object");

  return {
    ...base,
    name,
    prefix,
    logoUrl,
    method: String(method).toUpperCase(),
    url: String(url),
    headers,
    authMode,
    authHeader: auth?.header || base.authHeader,
    bodyMode: flatScalars ? "fields" : "json",
    bodyFields: flatScalars
      ? Object.entries(rawBody).map(([key, value]) => ({ key, value: value === null ? "null" : String(value) }))
      : base.bodyFields,
    bodyJson: rawBody === undefined || flatScalars
      ? ""
      : typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody, null, 2),
    vars: objectToRows(spec.vars),
    textPath: String(spec.textPath ?? create.textPath ?? ""),
    secondCall: poll ? (poll.mode === "stream" ? "stream" : "poll") : "off",
    idPath: String(spec.idPath ?? create.idPath ?? ""),
    pollUrl: String(poll?.url ?? ""),
    pollMethod: String(poll?.method ?? "GET").toUpperCase(),
    pollFields: poll?.body && typeof poll.body === "object" && !Array.isArray(poll.body)
      ? Object.entries(poll.body).map(([key, value]) => ({ key, value: value === null ? "null" : String(value) }))
      : base.pollFields,
    pollTextPath: String(poll?.textPath ?? ""),
    pollStatusPath: String(poll?.donePath ?? ""),
    pollDoneValues: (poll?.doneValues || []).join(", "),
  };
}

/**
 * Placeholders the recipe uses that the request cannot supply — the ones the
 * user has to give a value for. Existing values are carried over.
 */
export function missingVars(spec, existing = []) {
  const known = new Map((existing || []).map((row) => [String(row?.name ?? ""), row?.value ?? ""]));
  return collectPlaceholders(spec)
    .filter((name) => !AUTO_VARS.has(name))
    .map((name) => ({ name, value: known.get(name) ?? "" }));
}
