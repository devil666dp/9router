// Turn a pasted curl command into the flat recipe the form edits.
//
// Every provider that needs a recipe already ships a curl example in its docs,
// so that example is the natural input: paste it and the form arrives filled in
// — URL, method, headers, auth, body — exactly the way Postman's "import curl"
// works. What this adds on top is guessing which body field carries the prompt
// and rewriting it as `{prompt}`.
//
// It is a HELPER, not an authority: every field it fills stays editable, and
// validateSpec() still has the final say.

// Field names that plausibly carry the user's prompt, best guess first.
const PROMPT_KEYS = ["prompt", "input", "message", "text", "query", "question", "content", "instruction"];
const SYSTEM_KEYS = ["system_prompt", "system", "instructions", "context", "preamble"];
const IMAGE_KEYS = ["image_urls", "images", "image_url", "image"];
const FILE_KEYS = ["file_urls", "files", "attachments"];
// Response fields that plausibly carry the reply, best guess first.
const TEXT_KEYS = ["output", "text", "response", "answer", "result", "content", "message", "completion", "reply", "data"];
const ID_KEYS = ["runId", "run_id", "id", "taskId", "task_id", "eventId", "event_id", "requestId", "request_id", "predictionId"];
const STATUS_KEYS = ["status", "state", "phase"];
const DONE_WORDS = ["completed", "complete", "succeeded", "success", "done", "finished", "ok"];
const FAIL_WORDS = ["failed", "failure", "error", "cancelled", "canceled", "timeout"];

/**
 * Split a shell command into tokens, honouring quotes and line continuations.
 * Deliberately not a shell: no expansion, no substitution, no execution.
 */
function tokenize(command) {
  const text = String(command || "").replace(/\\\r?\n/g, " ");
  const tokens = [];
  let current = "";
  let quote = null;
  let started = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === "\\" && quote === '"' && i + 1 < text.length) current += text[++i];
      else current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; started = true; continue; }
    if (/\s/.test(ch)) {
      if (started || current) { tokens.push(current); current = ""; started = false; }
      continue;
    }
    current += ch;
  }
  if (started || current) tokens.push(current);
  return tokens.filter((t, i) => !(i === 0 && t === "curl"));
}

/** First key in `candidates` that exists on `obj`, else null. */
function firstKey(obj, candidates) {
  if (!obj || typeof obj !== "object") return null;
  const lower = new Map(Object.keys(obj).map((k) => [k.toLowerCase(), k]));
  for (const candidate of candidates) {
    const hit = lower.get(candidate.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

/**
 * Walk a sample body and replace the value at the guessed prompt/system/image
 * keys with the matching `{placeholder}`. Returns the rewritten template plus
 * which substitutions were made, so the form can show them.
 */
function templatize(body, model) {
  const mapped = [];

  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") {
      // A literal equal to the model id becomes {model} so one node serves many.
      if (model && typeof node === "string" && node === model) return "{model}";
      return node;
    }
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      const lower = key.toLowerCase();
      if (PROMPT_KEYS.includes(lower) && (typeof value === "string" || value === null)) {
        out[key] = "{prompt}"; mapped.push(`${key} → {prompt}`); continue;
      }
      if (SYSTEM_KEYS.includes(lower) && (typeof value === "string" || value === null)) {
        out[key] = "{system}"; mapped.push(`${key} → {system}`); continue;
      }
      if (IMAGE_KEYS.includes(lower) && Array.isArray(value)) {
        out[key] = "{images}"; mapped.push(`${key} → {images}`); continue;
      }
      if (FILE_KEYS.includes(lower) && Array.isArray(value)) {
        out[key] = "{files}"; mapped.push(`${key} → {files}`); continue;
      }
      // A nested prompt object ({message: {text, files}}) recurses normally.
      out[key] = walk(value);
    }
    return out;
  };

  return { template: walk(body), mapped };
}

/** Find a path to the most plausible reply text inside a sample response. */
export function guessTextPath(sample, depth = 0) {
  if (sample === null || sample === undefined || depth > 4) return null;
  if (Array.isArray(sample)) {
    if (!sample.length) return null;
    if (typeof sample[0] === "string") return "$[0]";
    const inner = guessTextPath(sample[0], depth + 1);
    return inner ? `$[0]${inner.replace(/^\$\.?/, ".")}`.replace(/\.\[/g, "[") : null;
  }
  if (typeof sample !== "object") return null;

  const direct = firstKey(sample, TEXT_KEYS);
  if (direct && (typeof sample[direct] === "string" || typeof sample[direct] === "number")) {
    return `$.${direct}`;
  }
  // Otherwise descend into the most promising container.
  for (const key of [...TEXT_KEYS, ...Object.keys(sample)]) {
    if (!(key in sample)) continue;
    const inner = guessTextPath(sample[key], depth + 1);
    if (inner) return `$.${key}${inner.replace(/^\$\.?/, ".")}`.replace(/\.\[/g, "[");
  }
  return null;
}

/**
 * Parse one or two curl commands into a flat recipe.
 *
 * @param {string} curl   the curl command(s) — a second one implies a poll step
 * @param {object} opts
 * @param {string} opts.createSample  sample JSON the first call returns
 * @param {string} opts.pollSample    sample JSON the poll call returns
 * @returns {{spec: object|null, notes: string[], errors: string[]}}
 */
export function specFromCurl(curl, { createSample = "", pollSample = "" } = {}) {
  const notes = [];

  // Two commands separated by a blank line / a second `curl` → call + poll.
  const commands = String(curl || "")
    .split(/\r?\n(?=\s*(?:#|curl\b))/)
    .map((chunk) => chunk.replace(/^\s*#.*$/gm, "").trim())
    .filter((chunk) => /curl/.test(chunk));

  if (!commands.length) {
    return { spec: null, notes, errors: ["No curl command found"] };
  }

  const parsed = commands.map(parseOne);
  const first = parsed[0];
  const poll = parsed[1] || null;

  if (!first.url) return { spec: null, notes, errors: ["Could not find a URL in the curl command"] };

  const model = first.body ? guessModelLiteral(first.body, first.url) : null;
  const { template, mapped } = first.body ? templatize(first.body, model) : { template: undefined, mapped: [] };
  notes.push(...mapped);
  if (model && pathSegments(first.url).includes(model)) {
    notes.push(`Model id "${model}" in the URL → {model}`);
  }

  const spec = {
    method: first.method,
    url: templatizeUrl(first.url, model),
    ...(Object.keys(first.headers).length ? { headers: first.headers } : {}),
    auth: first.auth,
    ...(template !== undefined ? { body: template } : {}),
  };

  const createJson = safeJson(createSample);
  const pollJson = safeJson(pollSample);

  if (poll) {
    const idKey = createJson ? firstKey(createJson, ID_KEYS) : null;
    // Left unset when unknown: run.js finds the id itself from the usual names.
    if (idKey) spec.idPath = `$.${idKey}`;

    // The poll URL carries the id somewhere; swap that segment for {id}.
    const idValue = idKey ? String(createJson[idKey]) : null;
    let pollUrl = poll.url;
    if (idValue && pollUrl.includes(idValue)) pollUrl = pollUrl.split(idValue).join("{id}");
    else if (!/\{id\}/.test(pollUrl)) {
      pollUrl = pollUrl.replace(/\/[A-Za-z0-9_-]+\/?$/, "/{id}");
      notes.push("Guessed where the job id goes in the poll URL — please check");
    }

    const statusKey = pollJson ? firstKey(pollJson, STATUS_KEYS) : null;
    const textPath = pollJson ? guessTextPath(pollJson) : null;

    // A second curl with no sample reply is far more often a stream than a
    // status poll (Gradio, SSE and NDJSON endpoints all look like this), but a
    // status field in the sample settles it either way.
    const streaming = !statusKey && !pollJson;
    spec.poll = {
      mode: streaming ? "stream" : "poll",
      method: poll.method === "POST" ? "POST" : "GET",
      url: templatizeUrl(pollUrl, model),
      ...(poll.body && typeof poll.body === "object" ? { body: poll.body } : {}),
      ...(statusKey ? { donePath: `$.${statusKey}`, doneValues: DONE_WORDS, failValues: FAIL_WORDS } : {}),
      ...(textPath ? { textPath } : {}),
    };
    if (streaming) notes.push("Second call set to Stream — switch it to Poll if the endpoint answers once per request");
    if (!textPath) notes.push("No sample for the second reply — 9router will take the whole reply as the answer");
  } else {
    const textPath = createJson ? guessTextPath(createJson) : null;
    if (textPath) spec.textPath = textPath;
    else notes.push("No sample reply given — 9router will take the whole reply as the answer");
  }

  return { spec, notes, errors: [] };
}

function safeJson(text) {
  if (!text || typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** A model id appearing in both URL and body is the node's model parameter. */
function guessModelLiteral(body, url) {
  for (const key of ["model", "nodeType", "nodeName", "modelId", "model_id", "engine", "deployment"]) {
    const value = body?.[key];
    if (typeof value === "string" && value && pathSegments(url).includes(value)) return value;
  }
  for (const key of ["model", "nodeType", "modelId", "model_id"]) {
    const value = body?.[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

/** Path segments of a URL, excluding the host — where a model id may legitimately appear. */
function pathSegments(url) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean);
  } catch {
    return String(url).split("/").filter(Boolean);
  }
}

/**
 * Substitute {model} for the model id in a URL — but only where it stands as a
 * whole PATH SEGMENT. A blind string replace rewrites "api.parallel.ai" into
 * "api.{model}.ai" when the model happens to be named after its vendor, which
 * silently breaks the host.
 */
function templatizeUrl(url, model) {
  if (!model) return url;
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").map((seg) => (seg === model ? "{model}" : seg));
    parsed.pathname = segments.join("/");
    // URL serialization percent-encodes braces; put the placeholders back so the
    // stored recipe stays human-readable and interpolate() still recognizes them.
    return parsed.toString().replace(/%7B/gi, "{").replace(/%7D/gi, "}");
  } catch {
    return url;
  }
}

/** Parse a single curl invocation into {method, url, headers, auth, body}. */
function parseOne(command) {
  const tokens = tokenize(command);
  const headers = {};
  let method = null;
  let url = "";
  let rawBody = "";
  let auth = { header: "Authorization", scheme: "bearer" };
  let sawAuth = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "-X" || token === "--request") { method = (tokens[++i] || "").toUpperCase(); continue; }
    if (token === "-H" || token === "--header") {
      const raw = tokens[++i] || "";
      const idx = raw.indexOf(":");
      if (idx === -1) continue;
      const name = raw.slice(0, idx).trim();
      const value = raw.slice(idx + 1).trim();
      if (/^authorization$/i.test(name)) {
        sawAuth = true;
        auth = /^bearer\b/i.test(value)
          ? { header: name, scheme: "bearer" }
          : { header: name, scheme: "raw", ...(value.split(/\s+/).length > 1 ? { prefix: `${value.split(/\s+/)[0]} ` } : {}) };
        continue;
      }
      if (/^x-api-key$/i.test(name)) { sawAuth = true; auth = { header: name, scheme: "raw" }; continue; }
      headers[name] = value;
      continue;
    }
    if (token === "-d" || token === "--data" || token === "--data-raw" || token === "--data-binary") {
      rawBody = tokens[++i] || ""; continue;
    }
    if (token === "-N" || token === "--no-buffer" || token === "-s" || token === "--silent" || token === "-L" || token === "--location") continue;
    if (token.startsWith("-")) { if (!token.includes("=")) i++; continue; }
    if (!url && /^https?:\/\//i.test(token)) url = token;
  }

  if (!sawAuth) auth = "none";

  const body = safeJson(rawBody);
  return {
    method: method || (rawBody ? "POST" : "GET"),
    url,
    headers,
    auth,
    // A non-JSON -d payload is kept verbatim so a form post survives the trip.
    body: body ?? (rawBody || undefined),
  };
}
