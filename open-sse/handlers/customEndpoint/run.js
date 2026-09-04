// Execute one recipe: build the request, call it, and (when the recipe has a
// poll step) poll until the upstream says done.
//
// The poll loop follows videoCore's shape deliberately — bounded interval,
// hard deadline, tolerant of transient failures, and abort-aware so a client
// hanging up stops the polling instead of orphaning it.

import { proxyAwareFetch } from "../../utils/proxyFetch.js";
import { interpolate, getPath, resolveTemplate } from "./template.js";
import { normalizeSpec, ID_KEYS } from "./spec.js";
import { coerceText, describeFields, extractUsage } from "./output.js";

// Consecutive poll failures tolerated before giving up on the job.
const MAX_POLL_FAILURES = 3;

/**
 * Recipe headers + auth. The recipe's own headers win over the defaults, so a
 * user who typed `Content-Type: application/x-www-form-urlencoded` gets it.
 * `scheme:"none"` adds no auth header at all.
 */
export function buildHeaders(spec, credentials, { json = true, vars = {} } = {}) {
  const headers = { Accept: "application/json" };
  if (json) headers["Content-Type"] = "application/json";
  for (const [name, value] of Object.entries(spec.headers || {})) {
    headers[interpolate(name, vars)] = interpolate(String(value ?? ""), vars);
  }

  const auth = spec.auth;
  if (auth?.scheme === "none") return headers;

  const token = credentials?.apiKey || credentials?.accessToken;
  // No key and no explicit "none": send nothing rather than a literal
  // "Bearer undefined", which is what the legacy combined path does.
  if (!token) return headers;

  const prefix = auth?.prefix !== undefined ? auth.prefix : (auth?.scheme === "bearer" ? "Bearer " : "");
  headers[auth?.header || "Authorization"] = `${prefix}${token}`;
  return headers;
}

function withQuery(url, query, vars) {
  const entries = Object.entries(query || {});
  if (!entries.length) return url;
  const target = new URL(url);
  for (const [key, value] of entries) {
    target.searchParams.set(interpolate(key, vars), interpolate(String(value), vars));
  }
  return target.toString();
}

/**
 * Serialize a resolved body according to the Content-Type the recipe asks for.
 * JSON is the default; a form content-type is honoured because that is what a
 * pasted `curl -d "a=b"` implies and JSON-encoding it would silently 400.
 */
function serializeBody(body, headers) {
  const contentType = String(headers["Content-Type"] || headers["content-type"] || "").toLowerCase();
  if (typeof body === "string") return body;
  if (contentType.includes("x-www-form-urlencoded")) {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(body || {})) {
      if (value === undefined || value === null) continue;
      form.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    }
    return form.toString();
  }
  return JSON.stringify(body ?? {});
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return { parsed: null, text: "" };
  try {
    return { parsed: JSON.parse(text), text };
  } catch {
    return { parsed: null, text };
  }
}

/** Message out of an upstream error payload, clamped so it is safe to surface. */
function upstreamError(payload, text, errorPath) {
  const named = errorPath ? coerceText(getPath(payload, errorPath)) : "";
  const fallback = payload?.error?.message || payload?.message || payload?.detail || text || "";
  return String(named || fallback).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 300);
}

class RecipeError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function callUpstream(url, init, proxyOptions, signal) {
  const response = await proxyAwareFetch(url, { ...init, signal }, proxyOptions);
  const { parsed, text } = await readJson(response);
  return { response, payload: parsed, text };
}

/**
 * Locate a job id in the first reply without being told where it is.
 *
 * "the requested id will be present in the previous response for sure" — so when
 * the user has not named a path, look for it: the usual field names at the top
 * level, then one level down (the common `{data: {id}}` wrapper). A bare string
 * reply is itself the id, which is how Gradio's event endpoint answers.
 */
function findJobId(payload) {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (!payload || typeof payload !== "object") return "";

  // Case- and separator-insensitive: providers write requestid, requestId and
  // request_id for the same field, and the user should not have to care which.
  const pick = (obj) => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return "";
    const normalized = new Map(
      Object.keys(obj).map((key) => [key.toLowerCase().replace(/[_-]/g, ""), key])
    );
    for (const candidate of ID_KEYS) {
      const hit = normalized.get(candidate.toLowerCase().replace(/[_-]/g, ""));
      if (!hit) continue;
      const value = obj[hit];
      if (typeof value === "string" || typeof value === "number") return String(value);
    }
    return "";
  };

  const direct = pick(payload);
  if (direct) return direct;
  // One level down covers the common {data: {id}} / {result: {id}} wrappers.
  for (const nested of Object.values(payload)) {
    const found = pick(nested);
    if (found) return found;
  }
  return "";
}

/** One extracted piece of text out of a streamed frame. */
function frameText(raw, textPath) {
  const payload = raw.startsWith("{") || raw.startsWith("[") ? tryJson(raw) : raw;
  if (payload === undefined) return "";
  if (textPath) return coerceText(getPath(payload, textPath));
  return coerceText(payload);
}

function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Read a streamed second call to its end and return the finished text.
 *
 * Two stream shapes exist in the wild and there is no header that distinguishes
 * them: deltas (each frame is the next fragment) and snapshots (each frame is
 * the whole answer so far). A frame that starts with what we already have is
 * treated as a snapshot and REPLACES it; anything else is appended. That reads
 * both correctly without asking the user which kind their provider sends.
 */
async function readStream(response, spec, signal) {
  const reader = response.body?.getReader?.();
  if (!reader) return coerceText(tryJson(await response.text()) ?? "");

  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  const consume = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    // SSE framing when present; a bare NDJSON line otherwise.
    if (/^(event|id|retry):/.test(trimmed)) return;
    const raw = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
    if (!raw || raw === "[DONE]") return;
    const piece = frameText(raw, spec.poll.textPath);
    if (!piece) return;
    if (piece.startsWith(text)) text = piece;
    else if (!text.endsWith(piece)) text += piece;
  };

  try {
    for (;;) {
      if (signal?.aborted) throw new RecipeError(499, "Client disconnected");
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      lines.forEach(consume);
    }
  } finally {
    reader.releaseLock?.();
  }
  consume(buffer);
  return text;
}

/**
 * Run a recipe to completion.
 *
 * @returns {{text: string, usage: object|null, url: string, requestBody: any}}
 * @param {object} p.input canonical request fields — also the variable bag
 * @throws {RecipeError} with an HTTP status chatCore can act on (fallback, retry)
 */
export async function runRecipe({ rawSpec, input, model, credentials, proxyOptions = null, signal = null, log = null }) {
  const spec = normalizeSpec(rawSpec);
  // One flat bag feeds URLs, headers, query and body alike: the recipe's own
  // stored variables first, then the canonical request fields, so {prompt} and
  // friends can never be shadowed by a stale saved value.
  const vars = { ...spec.vars, ...input, model, ...(input?.extraVars || {}) };

  // ── call ──────────────────────────────────────────────────────────────────
  const url = withQuery(interpolate(spec.url, vars), spec.query, vars);
  const sendsBody = spec.method !== "GET";
  const requestBody = sendsBody ? resolveTemplate(spec.body, vars) : undefined;
  const headers = buildHeaders(spec, credentials, { json: sendsBody, vars });

  log?.debug?.("CUSTOM", `${spec.method} ${url}`);

  const created = await callUpstream(url, {
    method: spec.method,
    headers,
    ...(sendsBody ? { body: serializeBody(requestBody, headers) } : {}),
  }, proxyOptions, signal);

  if (!created.response.ok) {
    throw new RecipeError(
      created.response.status,
      upstreamError(created.payload, created.text, spec.errorPath) || `Upstream returned ${created.response.status}`
    );
  }

  if (spec.protocol === "sync") {
    // No textPath given: take the whole reply and let coerceText find the
    // obvious wrapper. That covers most single-field APIs with zero config.
    const text = spec.textPath
      ? coerceText(getPath(created.payload, spec.textPath))
      : coerceText(created.payload ?? created.text);
    if (!text) {
      // Name the fields the upstream actually sent — the fix is almost always
      // pointing "Where the reply text is" at one of them.
      const fields = describeFields(created.payload);
      throw new RecipeError(502, spec.textPath
        ? `No reply text at ${spec.textPath}${fields ? `. The reply has: ${fields}` : ""}`
        : `Could not find the reply text${fields ? ` — the reply has: ${fields}. Set "Where the reply text is" to the right one` : " (upstream sent an empty body)"}`);
    }
    return { text, usage: extractUsage(created.payload, spec.usage), url, requestBody };
  }

  // ── two-step: the reply comes from a second call ──────────────────────────
  const jobId = spec.idPath
    ? coerceText(getPath(created.payload, spec.idPath))
    : findJobId(created.payload);

  // Only an error when the second call actually needs the id. A second call to a
  // fixed URL with no {id} anywhere is perfectly valid.
  const needsId = /\{id\}/.test(spec.poll.url) || /\{id\}/.test(JSON.stringify(spec.poll.body ?? ""));
  if (!jobId && needsId) {
    throw new RecipeError(502, spec.idPath
      ? `No job id at ${spec.idPath} in the first response`
      : "The first response carried no recognizable job id — fill in where the job ID is");
  }

  const pollVars = { ...vars, id: jobId };
  const pollUrl = interpolate(spec.poll.url, pollVars);
  const pollSendsBody = spec.poll.method !== "GET" && spec.poll.body !== null;
  const pollBody = () => {
    const headers = buildHeaders(spec, credentials, { json: pollSendsBody, vars: pollVars });
    return {
      method: spec.poll.method,
      headers,
      ...(pollSendsBody ? { body: serializeBody(resolveTemplate(spec.poll.body, pollVars), headers) } : {}),
    };
  };

  // ── streaming second call: one request, read to the end ────────────────────
  if (spec.poll.mode === "stream") {
    log?.debug?.("CUSTOM", `job ${jobId} → streaming ${pollUrl}`);
    const streamed = await proxyAwareFetch(pollUrl, { ...pollBody(), signal }, proxyOptions);
    if (!streamed.ok) {
      const text = await streamed.text().catch(() => "");
      throw new RecipeError(
        streamed.status,
        upstreamError(tryJson(text), text, spec.poll.errorPath) || `Stream returned ${streamed.status}`
      );
    }
    const text = await readStream(streamed, spec, signal);
    if (!text) throw new RecipeError(502, `Stream for job ${jobId} carried no text`);
    return { text, usage: null, url: pollUrl, requestBody };
  }

  const deadline = Date.now() + spec.poll.timeoutMs;
  let failures = 0;

  log?.debug?.("CUSTOM", `job ${jobId} → polling ${pollUrl} every ${spec.poll.intervalMs}ms`);

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new RecipeError(499, "Client disconnected");
    await new Promise((resolve) => setTimeout(resolve, spec.poll.intervalMs));
    if (signal?.aborted) throw new RecipeError(499, "Client disconnected");

    let polled;
    try {
      polled = await callUpstream(pollUrl, pollBody(), proxyOptions, signal);
    } catch (error) {
      if (signal?.aborted) throw new RecipeError(499, "Client disconnected");
      if (++failures >= MAX_POLL_FAILURES) {
        throw new RecipeError(502, `Job ${jobId} status poll failed ${failures}×: ${error.message}`);
      }
      continue;
    }

    // A 404 right after create is usually the job not being visible yet;
    // anything else is a real error worth surfacing.
    if (!polled.response.ok) {
      if (polled.response.status === 404 && failures < MAX_POLL_FAILURES) {
        failures++;
        continue;
      }
      throw new RecipeError(
        polled.response.status,
        upstreamError(polled.payload, polled.text, spec.poll.errorPath) || `Status poll returned ${polled.response.status}`
      );
    }
    failures = 0;

    const status = spec.poll.donePath
      ? String(coerceText(getPath(polled.payload, spec.poll.donePath))).toLowerCase()
      : null;

    if (status && spec.poll.failValues.includes(status)) {
      throw new RecipeError(502, upstreamError(polled.payload, polled.text, spec.poll.errorPath) || `Job ${jobId} failed (${status})`);
    }

    const text = spec.poll.textPath
      ? coerceText(getPath(polled.payload, spec.poll.textPath))
      : coerceText(polled.payload ?? polled.text);

    // Two ways to be done: the recipe names a status and it matched, or it
    // names none and the text field simply showed up.
    const done = spec.poll.donePath ? spec.poll.doneValues.includes(status) : !!text;
    if (!done) continue;

    if (!text) {
      throw new RecipeError(502, `Job ${jobId} reported done but no text at ${spec.poll.textPath}${
        describeFields(polled.payload) ? `. The reply has: ${describeFields(polled.payload)}` : ""}`);
    }
    return { text, usage: extractUsage(polled.payload, spec.usage), url: pollUrl, requestBody };
  }

  throw new RecipeError(504, `Job ${jobId} did not finish within ${Math.round(spec.poll.timeoutMs / 1000)}s`);
}

export { RecipeError };
