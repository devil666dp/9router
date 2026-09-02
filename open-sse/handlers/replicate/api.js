// Replicate — the protocol, shared by the image and video adapters.
//
// Every model on Replicate runs through ONE prediction API, so this file is the
// whole of it and neither adapter repeats it:
//
//   POST /v1/models/{owner}/{name}/predictions   -> { id, status, urls:{get,cancel}, ... }
//   POST /v1/predictions  { version, input }     -> same, for a versioned model
//   GET  /v1/predictions/{id}                    -> { status, output, error, logs, metrics }
//
// Which of the two creates a model takes is a property of the model, not of the
// request — see ./versions.js.
//
// `status` walks starting -> processing -> succeeded | failed | canceled, and the
// result only exists on `succeeded`. With `Prefer: wait=<seconds>` the create
// call holds the connection open and answers with the finished prediction when
// the render lands inside that window — that is what lets a fast image model
// return its URL from a single POST. Slower renders come back still running and
// are polled.
import { PROVIDER_MEDIA } from "../../providers/index.js";
import { resolveVersion } from "./versions.js";

export const API_ROOT = (
  PROVIDER_MEDIA["replicate"]?.imageConfig?.baseUrl
  || PROVIDER_MEDIA["replicate"]?.videoConfig?.baseUrl
  || "https://api.replicate.com/v1"
).replace(/\/$/, "");

// Replicate's own ceiling for `Prefer: wait` is 60s; past that the create call
// returns the still-running prediction and the caller polls.
export const MAX_PREFER_WAIT_SECONDS = 60;

/**
 * Creation URL for a model id.
 *
 * The route follows the version: an official model has no version to name and
 * runs from `/models/{owner}/{name}/predictions`, while anything with one — a
 * community model out of ./versions.js, or a hash the caller pinned themselves —
 * goes to `/predictions` and carries the version in the body. Posting a
 * community model to the official route is a 404, so this pairing is not a
 * preference.
 */
export function createUrl(modelId) {
  const raw = String(modelId || "").trim();
  if (resolveVersion(raw)) return `${API_ROOT}/predictions`;
  return `${API_ROOT}/models/${raw.split(":")[0]}/predictions`;
}

/** Body for a create: `{input}` on the official route, `{version,input}` on the other. */
export function createBody(modelId, input) {
  const version = resolveVersion(modelId);
  return version ? { version, input } : { input };
}

export function pollUrl(predictionId) {
  return `${API_ROOT}/predictions/${encodeURIComponent(predictionId)}`;
}

/**
 * Auth + content headers.
 *
 * Replicate accepts `Bearer` (current) and the older `Token` scheme; Bearer is
 * what the docs use today. `Prefer: wait=n` is only meaningful on the create
 * call — sending it on a poll would hold that GET open for no reason.
 */
export function buildHeaders(credentials, { create = false, waitSeconds = 0 } = {}) {
  const headers = { Accept: "application/json" };
  const key = credentials?.apiKey || credentials?.accessToken;
  if (key) headers.Authorization = `Bearer ${key}`;
  if (create) {
    headers["Content-Type"] = "application/json";
    const seconds = Math.min(Math.max(Math.round(Number(waitSeconds) || 0), 0), MAX_PREFER_WAIT_SECONDS);
    if (seconds > 0) headers.Prefer = `wait=${seconds}`;
  }
  return headers;
}

// Replicate prediction states -> the status vocabulary /v1/videos publishes, so a
// client polls one contract no matter which provider rendered the video.
const STATUS_MAP = {
  starting: "pending",
  processing: "processing",
  succeeded: "done",
  failed: "failed",
  canceled: "failed",
};

export function mapStatus(status) {
  return STATUS_MAP[status] || "processing";
}

export const TERMINAL_STATUSES = new Set(["succeeded", "failed", "canceled"]);

/**
 * Every file URL in a prediction's output, in order.
 *
 * Output schemas vary by model — a bare `uri` string, an array of them, or an
 * object with named file fields (`video`, `image`, `output`) — so all three are
 * flattened here rather than in each adapter. Anything that is not an http(s)
 * URL (a caption, a seed, a score) is skipped.
 */
export function outputUrls(output) {
  const urls = [];
  const visit = (value, depth = 0) => {
    if (value === null || value === undefined || depth > 3) return;
    if (typeof value === "string") {
      if (/^https?:\/\//.test(value)) urls.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (typeof value === "object") {
      for (const key of ["url", "video", "image", "output", "images", "video_url", "audio", "file"]) {
        if (value[key] !== undefined) visit(value[key], depth + 1);
      }
    }
  };
  visit(output);
  return urls;
}

/**
 * A prediction's failure message.
 *
 * `error` is where a failed prediction explains itself; when it is empty (a
 * canceled prediction, or a failure with no message) the tail of `logs` is the
 * only signal, and it is far more useful to the caller than "failed".
 */
export function predictionError(prediction) {
  const error = prediction?.error;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const detail = error.detail || error.message || error.title;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
  }
  const logs = typeof prediction?.logs === "string" ? prediction.logs.trim() : "";
  if (logs) return logs.split("\n").filter(Boolean).slice(-3).join(" ").slice(0, 500);
  return null;
}

/**
 * Error text out of a non-2xx Replicate response body.
 *
 * Replicate answers 4xx with `{"detail": "..."}` and, for validation failures,
 * `{"title","detail","status","invalid_fields":[...]}` — the invalid field names
 * are the actionable part, so they are surfaced alongside the message.
 */
export function upstreamError(bodyText, status) {
  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return (bodyText || `HTTP ${status}`).slice(0, 500);
  }
  const parts = [];
  const detail = payload?.detail || payload?.error || payload?.title;
  if (typeof detail === "string" && detail.trim()) parts.push(detail.trim());
  const invalid = payload?.invalid_fields;
  if (Array.isArray(invalid) && invalid.length) {
    const named = invalid
      .map((f) => (typeof f === "string" ? f : [f?.field, f?.description].filter(Boolean).join(": ")))
      .filter(Boolean);
    if (named.length) parts.push(`(${named.join("; ")})`);
  }
  return parts.length ? parts.join(" ") : (bodyText || `HTTP ${status}`).slice(0, 500);
}
