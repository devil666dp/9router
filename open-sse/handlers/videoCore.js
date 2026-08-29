import { createErrorResult } from "../utils/error.js";
import { HTTP_STATUS } from "../config/runtimeConfig.js";
import { refreshTokenByProvider } from "../services/tokenRefresh.js";
import { PROVIDER_MEDIA } from "../providers/index.js";
import { getVideoAdapter } from "./videoProviders/index.js";

// Upstream fetch deadline for video job submission/polling (the job itself is
// async upstream — this only bounds the HTTP round-trip, not video rendering).
const VIDEO_FETCH_TIMEOUT_MS = Number(process.env.VIDEO_FETCH_TIMEOUT_MS || 120000);

// Ceiling for waiting out a job inside the create request (adapter providers
// that opt in with `awaitCompletion`). Renders take minutes, so this is long by
// design; when it expires the create response still carries the request_id, so
// the client's own GET /v1/videos/{id} can finish the job off.
const VIDEO_AWAIT_TIMEOUT_MS = Number(process.env.VIDEO_AWAIT_TIMEOUT_MS || 900000);

// Interval used when an adapter declares no pollIntervalMs.
const AWAIT_POLL_INTERVAL_MS = 5000;

// Consecutive failed status polls tolerated before handing the id back to the
// client instead of erroring — the job exists upstream either way.
const AWAIT_MAX_POLL_FAILURES = 3;

// POST /videos/* creates a billable upstream job. A network error after the
// request left the socket may still have created the job, so creation is NEVER
// auto-retried (the only re-send is the auth retry after a 401/403 refresh,
// which upstream rejects before job creation).
export const VIDEO_ACTIONS = new Set(["generations", "edits", "extensions"]);

export function getVideoConfig(provider) {
  return PROVIDER_MEDIA[provider]?.videoConfig || null;
}

/** Strip bearer tokens / obvious secrets from text destined for clients or logs. */
export function sanitizeSecrets(text, credentials = null) {
  if (!text) return text;
  let out = String(text).replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]");
  for (const key of ["accessToken", "refreshToken", "apiKey"]) {
    const secret = credentials?.[key];
    if (typeof secret === "string" && secret.length >= 8) {
      out = out.split(secret).join("[redacted]");
    }
  }
  return out;
}

function buildUpstreamUrl(config, action, requestId) {
  const base = config.baseUrl.replace(/\/$/, "");
  return requestId ? `${base}/${encodeURIComponent(requestId)}` : `${base}/${action}`;
}

function buildHeaders({ token, contentType, idempotencyKey }) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (contentType) headers["Content-Type"] = contentType;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  return headers;
}

/**
 * Per-provider request/response translation for upstreams that are not already
 * shaped like /v1/videos.
 *
 * Most providers need none: xAI's own API IS this endpoint, so its bytes are
 * forwarded and returned untouched. A provider with an adapter (DashScope/qwen)
 * gets its create and poll URLs, headers and body from the adapter, and both
 * responses normalized back into the published `{request_id}` /
 * `{status, video:{url}}` contract — so the client sees one shape either way.
 * An adapter that also sets `awaitCompletion` has its create waited out here,
 * so the caller gets the finished video from the single POST.
 *
 * Returns null for providers without an adapter, leaving the proxy path
 * byte-for-byte as it was.
 */
function buildAdapterRequest({ provider, requestId, rawBody, contentType, credentials }) {
  const adapter = getVideoAdapter(provider);
  if (!adapter) return null;

  if (requestId) {
    return {
      adapter,
      method: "GET",
      url: adapter.pollUrl(requestId),
      headers: adapter.buildHeaders(credentials, { create: false }),
      body: undefined,
    };
  }

  // Creation needs the parsed body to reshape it, so multipart cannot be served
  // here — these upstreams take media as URLs or data: URIs inside JSON anyway.
  if (contentType && !contentType.includes("application/json")) {
    throw new Error(`[${provider}] video generation requires a JSON body (received ${contentType})`);
  }
  let parsed;
  try {
    parsed = typeof rawBody === "string" ? JSON.parse(rawBody) : JSON.parse(Buffer.from(rawBody || "").toString("utf8"));
  } catch {
    throw new Error(`[${provider}] invalid JSON body`);
  }
  if (!parsed?.model) throw new Error(`[${provider}] missing required field: model`);

  return {
    adapter,
    method: "POST",
    url: adapter.createUrl(parsed.model, credentials),
    headers: adapter.buildHeaders(credentials, { create: true }),
    body: JSON.stringify(adapter.buildBody(parsed.model, parsed)),
  };
}

/** Run the adapter's normalizer over a successful upstream body. */
function normalizeAdapterResponse(adapter, requestId, bodyText) {
  const payload = JSON.parse(bodyText);
  return requestId ? adapter.normalizePoll(payload) : adapter.normalizeCreate(payload);
}

/** Abortable delay: rejects as soon as the client goes away. */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener?.("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

function combineSignals(signal, timeoutMs) {
  const timeoutSignal = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(timeoutMs) : null;
  if (signal && timeoutSignal && typeof AbortSignal.any === "function") {
    return AbortSignal.any([signal, timeoutSignal]);
  }
  return signal || timeoutSignal || undefined;
}

/**
 * Wait out a freshly created job and answer the create request with the finished
 * video, so callers get one call instead of create-then-poll.
 *
 * Only adapter providers that set `awaitCompletion` take this path (DashScope
 * has no synchronous video endpoint, so waiting here is the only way to hand
 * back a URL). It is deliberately give-up-friendly: on timeout, repeated poll
 * failures, or an unparseable status, the original create payload is returned
 * unchanged, leaving the client's own GET /v1/videos/{id} as the fallback. The
 * job is never re-created, and nothing here is billable.
 *
 * @returns {object} the finished poll payload, or `created` when giving up
 */
async function awaitVideoCompletion({ adapter, provider, created, credentials, signal, timeoutMs, log }) {
  const taskId = created?.request_id || created?.id;
  if (!taskId) return created;

  const url = adapter.pollUrl(taskId);
  const headers = adapter.buildHeaders(credentials, { create: false });
  const interval = Number(adapter.pollIntervalMs) > 0 ? Number(adapter.pollIntervalMs) : AWAIT_POLL_INTERVAL_MS;
  const deadline = Date.now() + (Number(timeoutMs) > 0 ? Number(timeoutMs) : VIDEO_AWAIT_TIMEOUT_MS);

  let failures = 0;
  let last = created;
  // Short first waits so a fast render answers quickly, ramping to the interval
  // the provider recommends for the long tail.
  let delay = Math.min(interval, 1500);

  while (Date.now() < deadline) {
    try {
      await sleep(Math.min(delay, Math.max(0, deadline - Date.now())), signal);
      delay = Math.min(interval, delay * 2);
    } catch {
      // Client hung up — stop polling and let the caller answer with the id.
      return last;
    }
    if (Date.now() >= deadline) break;

    let payload;
    try {
      const res = await fetch(url, { headers, signal: combineSignals(signal, VIDEO_FETCH_TIMEOUT_MS) });
      const text = await res.text().catch(() => "");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      payload = adapter.normalizePoll(JSON.parse(text));
    } catch (error) {
      if (signal?.aborted) return last;
      if (++failures >= AWAIT_MAX_POLL_FAILURES) {
        log?.warn?.("VIDEO", `${provider.toUpperCase()} | status poll gave up after ${failures} failures: ${sanitizeSecrets(error.message, credentials)}`);
        return last;
      }
      continue;
    }

    failures = 0;
    last = payload;
    if (payload?.status === "done" || payload?.status === "failed") return payload;
  }

  log?.info?.("VIDEO", `${provider.toUpperCase()} | job ${taskId} still rendering after ${Math.round((Number(timeoutMs) || VIDEO_AWAIT_TIMEOUT_MS) / 1000)}s — returning id for client polling`);
  return last;
}

/**
 * Transparent proxy for async video jobs (xAI Grok Imagine shape).
 *
 * - Forwards the raw body byte-for-byte (JSON or multipart) — no reshaping.
 * - Passes upstream JSON (request_id, status, video.url, error) back verbatim.
 * - 401/403 with a refresh token: refresh ONCE, retry ONCE. No other retry.
 * - Upstream error text is sanitized before it reaches the client.
 *
 * Providers with an adapter instead get their request translated and their
 * response normalized into that same shape; those declaring `awaitCompletion`
 * (DashScope/qwen, which has no synchronous video endpoint) additionally have
 * the render waited out inside the create call, so one POST returns the video.
 *
 * @param {object} options
 * @param {string} options.provider - Provider id (must have registry videoConfig)
 * @param {"generations"|"edits"|"extensions"|null} options.action - Creation action (POST)
 * @param {string|null} [options.requestId] - Poll target (GET /videos/{id})
 * @param {Buffer|string|null} [options.rawBody] - Exact body to forward
 * @param {string|null} [options.contentType] - Original Content-Type header
 * @param {string|null} [options.idempotencyKey] - Forwarded Idempotency-Key
 * @param {object} options.credentials - { accessToken?, apiKey?, refreshToken?, authType? }
 * @param {AbortSignal} [options.signal] - Client cancellation signal
 * @param {number} [options.timeoutMs]
 * @param {object} [options.log]
 * @param {function} [options.onCredentialsRefreshed]
 * @returns {Promise<{ success: boolean, response: Response, status?: number, error?: string }>}
 */
export async function handleVideoProxyCore({
  provider,
  action = null,
  requestId = null,
  rawBody = null,
  contentType = null,
  idempotencyKey = null,
  credentials,
  signal,
  timeoutMs = VIDEO_FETCH_TIMEOUT_MS,
  log,
  onCredentialsRefreshed,
}) {
  const config = getVideoConfig(provider);
  if (!config) {
    return createErrorResult(HTTP_STATUS.BAD_REQUEST, `Provider '${provider}' does not support video generation`);
  }
  if (!requestId && !VIDEO_ACTIONS.has(action)) {
    return createErrorResult(HTTP_STATUS.BAD_REQUEST, `Unknown video action: ${action}`);
  }

  // Providers whose API already matches /v1/videos are proxied verbatim; the
  // rest translate through an adapter.
  let translated = null;
  try {
    translated = buildAdapterRequest({ provider, requestId, rawBody, contentType, credentials });
  } catch (error) {
    return createErrorResult(HTTP_STATUS.BAD_REQUEST, error.message || `Invalid ${provider} video request`);
  }

  const method = requestId ? "GET" : "POST";
  const url = translated ? translated.url : buildUpstreamUrl(config, action, requestId);
  const fetchSignal = combineSignals(signal, timeoutMs);

  const doFetch = (token) =>
    fetch(url, {
      method,
      headers: translated
        ? { ...translated.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
        : buildHeaders({ token, contentType: method === "POST" ? contentType : null, idempotencyKey: method === "POST" ? idempotencyKey : null }),
      body: translated ? translated.body : method === "POST" ? rawBody : undefined,
      signal: fetchSignal,
    });

  let upstream;
  try {
    upstream = await doFetch(credentials?.accessToken || credentials?.apiKey);
  } catch (error) {
    if (error?.name === "AbortError" || error?.name === "TimeoutError") {
      return createErrorResult(HTTP_STATUS.REQUEST_TIMEOUT, `[${provider}] video ${method} aborted: ${error.message}`);
    }
    // Never re-send a creation POST on network error — the job may already exist upstream.
    return createErrorResult(HTTP_STATUS.BAD_GATEWAY, sanitizeSecrets(`[${provider}] video upstream fetch failed: ${error.message}`, credentials));
  }

  // 401/403 → refresh once → retry once (OAuth accounts only; API keys can't refresh)
  if (
    (upstream.status === HTTP_STATUS.UNAUTHORIZED || upstream.status === HTTP_STATUS.FORBIDDEN) &&
    credentials?.refreshToken
  ) {
    let refreshed = null;
    try {
      refreshed = await refreshTokenByProvider(provider, credentials, log);
    } catch (error) {
      log?.warn?.("TOKEN", `${provider} | video refresh error: ${sanitizeSecrets(error.message, credentials)}`);
    }
    if (refreshed?.accessToken) {
      log?.info?.("TOKEN", `${provider.toUpperCase()} | refreshed for video ${method}`);
      Object.assign(credentials, refreshed);
      if (onCredentialsRefreshed) await onCredentialsRefreshed(refreshed);
      try {
        await upstream.body?.cancel?.();
      } catch { /* noop */ }
      try {
        upstream = await doFetch(credentials.accessToken || credentials.apiKey);
      } catch (error) {
        return createErrorResult(HTTP_STATUS.BAD_GATEWAY, sanitizeSecrets(`[${provider}] video retry after refresh failed: ${error.message}`, credentials));
      }
    } else {
      log?.warn?.("TOKEN", `${provider.toUpperCase()} | video refresh failed — account needs re-auth`);
    }
  }

  const bodyText = await upstream.text().catch(() => "");

  if (!upstream.ok) {
    const message = sanitizeSecrets(bodyText || `HTTP ${upstream.status}`, credentials);
    return createErrorResult(upstream.status, `[${provider}] ${message.slice(0, 2000)}`);
  }

  // Adapter providers: reshape into the published contract. A 200 can still
  // carry an upstream error envelope (no task id), which is a bad gateway here.
  if (translated) {
    let normalized;
    try {
      normalized = normalizeAdapterResponse(translated.adapter, requestId, bodyText);
    } catch (error) {
      return createErrorResult(
        HTTP_STATUS.BAD_GATEWAY,
        sanitizeSecrets(`[${provider}] ${error.message || "unexpected video response"}`, credentials)
      );
    }
    // A create on an await-completion adapter blocks until the render finishes,
    // then answers with the video URL — one call for the whole job. On timeout
    // or a hung-up client it falls back to the create payload, so the client's
    // GET /v1/videos/{id} still works. Polls (requestId set) never re-enter here.
    // A create that already reports failure needs no wait. Any other status does
    // — including "done", because the create envelope carries no video URL.
    if (!requestId && translated.adapter.awaitCompletion && normalized?.status !== "failed") {
      normalized = await awaitVideoCompletion({
        adapter: translated.adapter,
        provider,
        created: normalized,
        credentials,
        signal,
        timeoutMs: VIDEO_AWAIT_TIMEOUT_MS,
        log,
      });
    }
    return {
      success: true,
      response: new Response(JSON.stringify(normalized), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      }),
    };
  }

  // Success: pass the upstream JSON through untouched (request_id / status / video.url).
  return {
    success: true,
    response: new Response(bodyText, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }),
  };
}
