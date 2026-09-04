// Recipe normalization + validation.
//
// A recipe describes an upstream that speaks none of the formats 9router knows.
// It is stored as JSON on the provider node and arrives at runtime through
// `credentials.providerSpecificData.spec` — the same channel that already
// carries `baseUrl` for openai-compatible nodes.
//
// The shape is deliberately flat, the way a Postman request is flat:
//
//   url        REQUIRED   "https://api.x.com/v1/nodes/{model}/run"
//   method     default POST
//   headers    { "Content-Type": "application/json" }  (that default is added)
//   auth       { scheme: "bearer" | "raw" | "none", header, prefix }
//   body       the request body — object, array or string; braces substituted
//   textPath   REQUIRED   where the reply text lives: "$.output"
//   usage      { promptPath, completionPath, totalPath }   optional
//   poll       present only when the reply needs a SECOND call:
//     mode       "poll" (ask again until done) | "stream" (read one stream)
//     url        REQUIRED   may contain {id}
//     method     default GET
//     body       sent when the method is not GET, e.g. {"requestid":"{id}"}
//     textPath   where the reply text lives once done
//     donePath / doneValues / failValues / errorPath   (poll mode only)
//     intervalMs / timeoutMs
//
//   {id} is the job id from the FIRST reply. `idPath` says where it is; without
//   one, the id is auto-detected from the usual field names.
//
// Anything in braces — {prompt}, {system}, {model}, {temperature}, {images} —
// is substituted from the request. `poll.url` also gets {id}.
//
// Validation is strict on arrival (the API route rejects a bad shape) and
// forgiving at runtime (a path that misses yields undefined, not a throw).

export const PROTOCOLS = ["sync", "job"];
export const POLL_MODES = ["poll", "stream"];

/** Field names that carry a job id, best guess first — used when idPath is absent. */
export const ID_KEYS = [
  "runId", "run_id", "id", "taskId", "task_id", "eventId", "event_id",
  "requestId", "request_id", "predictionId", "prediction_id", "jobId", "job_id",
];

export const DEFAULTS = {
  method: "POST",
  pollMethod: "GET",
  pollIntervalMs: 1500,
  pollTimeoutMs: 300000,
  authHeader: "Authorization",
  authScheme: "bearer",
  contentType: "application/json",
};

// Poll cadence bounds. A recipe asking for a 50ms poll would hammer the
// upstream on the user's behalf; one asking for an hour would outlive every
// client. Clamp rather than reject — the intent is still honourable.
export const POLL_INTERVAL_MIN_MS = 250;
export const POLL_INTERVAL_MAX_MS = 30000;
export const POLL_TIMEOUT_MAX_MS = 600000;

const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
const METHODS = ["POST", "GET", "PUT", "PATCH"];

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(n, min), max);
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function normalizeAuth(raw) {
  if (raw === "none" || raw?.scheme === "none") return { scheme: "none" };
  const header = String(raw?.header || DEFAULTS.authHeader).trim();
  const scheme = raw?.scheme === "raw" ? "raw" : DEFAULTS.authScheme;
  return {
    header,
    scheme,
    // Custom prefix for exotic schemes ("Token ", "Key ") — bearer implies "Bearer ".
    ...(raw?.prefix ? { prefix: String(raw.prefix) } : {}),
  };
}

// Recipes written against the first iteration nested everything under `create`.
// Flatten those on read so stored nodes keep working.
function flatten(raw) {
  const spec = plainObject(raw) || {};
  const create = plainObject(spec.create);
  if (!create) return spec;
  return {
    ...spec,
    url: spec.url ?? create.url,
    method: spec.method ?? create.method,
    body: spec.body ?? create.body,
    query: spec.query ?? create.query,
    textPath: spec.textPath ?? create.textPath,
    idPath: spec.idPath ?? create.idPath,
    errorPath: spec.errorPath ?? create.errorPath,
  };
}

/**
 * Normalize a raw recipe into the shape the executor consumes.
 * Never throws — call validateSpec() first when the input is untrusted.
 */
export function normalizeSpec(raw) {
  const spec = flatten(raw);
  const poll = plainObject(spec.poll) || {};
  // The protocol is not a field the user picks: a recipe with a poll URL is a
  // create-then-poll recipe, and one without is a single call.
  const protocol = poll.url ? "job" : "sync";

  const headers = { ...(plainObject(spec.headers) || {}) };
  const normalized = {
    protocol,
    auth: normalizeAuth(spec.auth),
    headers,
    method: METHODS.includes(String(spec.method || "").toUpperCase())
      ? String(spec.method).toUpperCase()
      : DEFAULTS.method,
    url: String(spec.url || "").trim(),
    body: spec.body === undefined ? {} : spec.body,
    query: plainObject(spec.query) || {},
    textPath: spec.textPath ? String(spec.textPath) : null,
    idPath: spec.idPath ? String(spec.idPath) : null,
    errorPath: spec.errorPath ? String(spec.errorPath) : null,
    usage: plainObject(spec.usage) || null,
    // User-defined placeholders: {workspace_id}, {voice}, … Canonical request
    // fields always win, so a stored var can never shadow {prompt}.
    vars: Object.fromEntries(
      Object.entries(plainObject(spec.vars) || {}).map(([key, value]) => [String(key), value])
    ),
  };

  if (protocol === "job") {
    normalized.poll = {
      mode: poll.mode === "stream" ? "stream" : "poll",
      method: METHODS.includes(String(poll.method || "").toUpperCase())
        ? String(poll.method).toUpperCase()
        : DEFAULTS.pollMethod,
      url: String(poll.url || "").trim(),
      body: poll.body === undefined ? null : poll.body,
      donePath: poll.donePath ? String(poll.donePath) : null,
      doneValues: (Array.isArray(poll.doneValues) ? poll.doneValues : []).map((v) => String(v).toLowerCase()),
      failValues: (Array.isArray(poll.failValues) ? poll.failValues : []).map((v) => String(v).toLowerCase()),
      textPath: poll.textPath ? String(poll.textPath) : null,
      errorPath: poll.errorPath ? String(poll.errorPath) : null,
      intervalMs: clamp(poll.intervalMs, POLL_INTERVAL_MIN_MS, POLL_INTERVAL_MAX_MS, DEFAULTS.pollIntervalMs),
      timeoutMs: clamp(poll.timeoutMs, 1000, POLL_TIMEOUT_MAX_MS, DEFAULTS.pollTimeoutMs),
    };
  }

  return normalized;
}

// ── validation ──────────────────────────────────────────────────────────────

function isHttpUrl(value) {
  // Braces are legal in a recipe URL but not in a URL — swap them for a token
  // that parses, so validation judges the shape and not the placeholders.
  try {
    const probe = new URL(String(value).replace(/\{[^}]*\}/g, "x"));
    return probe.protocol === "http:" || probe.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Human-readable problems with a recipe, empty when it is usable.
 * Field names match what the form labels, so an error can be shown verbatim.
 */
export function validateSpec(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return ["Recipe must be a JSON object"];
  }

  const spec = normalizeSpec(raw);

  if (!spec.url) errors.push("URL is required");
  else if (!isHttpUrl(spec.url)) errors.push("URL must be a full http(s) URL");

  for (const name of Object.keys(spec.headers)) {
    if (!HEADER_NAME.test(name)) errors.push(`Header name "${name}" is not valid`);
  }

  if (spec.auth.scheme !== "none" && !HEADER_NAME.test(spec.auth.header)) {
    errors.push(`Auth header "${spec.auth.header}" is not valid`);
  }

  if (spec.protocol === "job") {
    if (!isHttpUrl(spec.poll.url)) errors.push("Second call URL must be a full http(s) URL");
    // idPath is optional: without one the job id is auto-detected from the
    // first reply, which is the whole point of "the id will be in there".
    if (spec.poll.mode === "poll" && spec.poll.donePath && !spec.poll.doneValues.length) {
      errors.push("Done values are required when a status field is set");
    }
  } else if (plainObject(raw.poll) && !plainObject(raw.poll).url) {
    errors.push("Second call URL is required");
  }

  return errors;
}

/** Every absolute URL a recipe would call — the SSRF pre-check reads this. */
export function specUrls(raw) {
  const spec = normalizeSpec(raw);
  const urls = [spec.url];
  if (spec.protocol === "job") urls.push(spec.poll.url);
  return urls
    .filter(Boolean)
    .map((url) => String(url).replace(/\{[^}]*\}/g, "x"))
    .filter((url) => /^https?:\/\//i.test(url));
}

/**
 * Placeholder names used anywhere in a recipe, so the form can ask for the ones
 * the request does not already supply. Pure string scan — safe in the browser.
 */
export function collectPlaceholders(raw) {
  const found = new Set();
  const walk = (value) => {
    if (typeof value === "string") {
      for (const m of value.matchAll(/\{([a-zA-Z0-9_.-]+)\}/g)) found.add(m[1]);
      return;
    }
    if (Array.isArray(value)) return value.forEach(walk);
    if (value && typeof value === "object") {
      for (const [key, inner] of Object.entries(value)) {
        walk(key);
        walk(inner);
      }
    }
  };
  const spec = flatten(raw);
  walk(spec.url);
  walk(spec.headers);
  walk(spec.query);
  walk(spec.body);
  if (plainObject(spec.poll)) {
    walk(spec.poll.url);
    walk(spec.poll.body);
  }
  return [...found];
}
