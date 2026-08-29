import {
  getProviderCredentials,
  markAccountUnavailable,
  clearAccountError,
  extractApiKey,
  isValidApiKey,
} from "../services/auth.js";
import { getSettings } from "@/lib/localDb";
import { getModelInfo, getComboModels } from "../services/model.js";
import { handleVideoProxyCore, getVideoConfig, sanitizeSecrets } from "open-sse/handlers/videoCore.js";
import { errorResponse, unavailableResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import { updateProviderCredentials, checkAndRefreshToken } from "../services/tokenRefresh.js";
import { runMediaCombo } from "../services/mediaCombo.js";
import * as log from "../utils/logger.js";

// Fallback provider for requests that name no provider: a bare model id, or a multipart
// body we deliberately don't parse. xAI is the only registry entry with a videoConfig today.
const DEFAULT_VIDEO_PROVIDER = "xai";

// Creation POSTs are billable jobs — only rotate to another account for
// errors that upstream rejects BEFORE creating a job (auth/quota). A 5xx may
// have created the job, so it is returned to the caller instead of re-sent.
const CREATE_ROTATION_STATUSES = new Set([
  HTTP_STATUS.UNAUTHORIZED,
  HTTP_STATUS.FORBIDDEN,
  HTTP_STATUS.RATE_LIMITED,
]);

async function requireValidApiKey(request) {
  const apiKey = extractApiKey(request);
  const settings = await getSettings();
  if (settings.requireApiKey) {
    if (!apiKey) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    const valid = await isValidApiKey(apiKey);
    if (!valid) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
  }
  return null;
}

/**
 * Read the request body once, byte-preserving.
 * JSON bodies are additionally parsed so the `model` provider prefix can be
 * resolved (and stripped) — everything else is forwarded exactly as received.
 */
async function readForwardableBody(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const raw = await request.text();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { error: errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body") };
    }
    return { raw, parsed, contentType };
  }
  // Multipart (or any other content type): forward the exact bytes — parsing
  // and re-encoding FormData would change the multipart boundary.
  const buf = Buffer.from(await request.arrayBuffer());
  return { raw: buf, parsed: null, contentType };
}

async function resolveVideoProvider(rawModel) {
  if (!rawModel) return { provider: DEFAULT_VIDEO_PROVIDER, model: null };

  const modelStr = String(rawModel);
  const modelInfo = await getModelInfo(modelStr);
  if (!modelInfo.provider) {
    // A null provider here means the name resolved to neither a provider prefix nor a known
    // alias. Combo names also land here, but handleVideoCreate expands those before calling
    // this, so by now the name is simply unroutable.
    return { error: errorResponse(HTTP_STATUS.BAD_REQUEST, `Cannot resolve video model: ${modelStr}`) };
  }
  if (!getVideoConfig(modelInfo.provider)) {
    // Bare model ids (no explicit "provider/" prefix) fall back to the default
    // video provider — the prefix-less inference targets chat providers only.
    if (!modelStr.includes("/")) {
      return { provider: DEFAULT_VIDEO_PROVIDER, model: modelStr };
    }
    return { error: errorResponse(HTTP_STATUS.BAD_REQUEST, `Provider '${modelInfo.provider}' does not support video generation`) };
  }
  return { provider: modelInfo.provider, model: modelInfo.model };
}

function withJobHeaders(response, connectionId, provider) {
  const headers = new Headers(response.headers);
  // Video jobs are bound to the creating account AND the creating provider upstream.
  // Clients echo both back on GET polls (`x-connection-id`, `x-provider`) so the poll
  // reaches the same account at the same provider that minted the job id.
  if (connectionId) headers.set("x-9router-connection-id", String(connectionId));
  if (provider) headers.set("x-9router-provider", String(provider));
  return new Response(response.body, { status: response.status, headers });
}

/**
 * Retry predicate for video-combo creation.
 *
 * Creation POSTs are billable. A 5xx may mean the job was created and the response was lost,
 * so re-sending it to another provider would bill twice — those are returned to the caller.
 * Anything below 500 (auth, quota, unsupported params, no credentials) is rejected before a
 * job exists, so the next combo member gets the same prompt. Mirrors the intent of
 * CREATE_ROTATION_STATUSES, which governs rotation between accounts of one provider.
 */
function videoComboShouldFallback(status) {
  return { shouldFallback: Number(status) < 500, cooldownMs: 0 };
}

/**
 * Which provider a poll should be sent to.
 *
 * Clients created before combos existed send no `x-provider`, so an absent or unusable value
 * falls back to the default — preserving their behavior. A named provider is honored only when
 * it actually does video, so the header can't be used to aim a poll at an arbitrary provider.
 */
function resolvePollProvider(headerValue) {
  const candidate = typeof headerValue === "string" ? headerValue.trim() : "";
  if (!candidate || !getVideoConfig(candidate)) return DEFAULT_VIDEO_PROVIDER;
  return candidate;
}

/**
 * POST /v1/videos/{generations|edits|extensions} — async job creation proxy.
 */
export async function handleVideoCreate(request, action) {
  const authError = await requireValidApiKey(request);
  if (authError) return authError;

  const bodyInfo = await readForwardableBody(request);
  if (bodyInfo.error) return bodyInfo.error;

  // Combo expansion: model may be a combo name → retry the same prompt on the next member.
  // JSON only. A multipart body is forwarded as opaque bytes to preserve its boundary, so the
  // `model` field can't be rewritten per attempt — those keep the single-provider path.
  if (bodyInfo.parsed?.model) {
    const modelStr = String(bodyInfo.parsed.model);
    const comboModels = await getComboModels(modelStr);
    if (comboModels) {
      const settings = await getSettings();
      return runMediaCombo({
        comboName: modelStr,
        models: comboModels,
        settings,
        log,
        tag: "VIDEO",
        shouldFallbackFn: videoComboShouldFallback,
        handleSingleModel: (_body, m) => handleSingleModelVideoCreate(request, action, bodyInfo, m),
      });
    }
  }

  return handleSingleModelVideoCreate(request, action, bodyInfo, bodyInfo.parsed?.model ?? null);
}

/**
 * Create a video job on one target model, rotating between that provider's accounts.
 * Returns a Response so it can be used as a combo attempt.
 */
async function handleSingleModelVideoCreate(request, action, bodyInfo, rawModel) {
  const resolved = await resolveVideoProvider(rawModel);
  if (resolved.error) return resolved.error;
  const { provider, model } = resolved;

  // Strip the provider prefix (e.g. "xai/grok-imagine-video") before forwarding;
  // otherwise forward the original bytes untouched. A combo attempt also lands here, so the
  // comparison is against this attempt's target rather than the body's original model field.
  let forwardBody = bodyInfo.raw;
  if (bodyInfo.parsed && model && bodyInfo.parsed.model !== model) {
    forwardBody = JSON.stringify({ ...bodyInfo.parsed, model });
  }

  const preferredConnectionId = request.headers.get("x-connection-id") || null;
  const idempotencyKey = request.headers.get("idempotency-key") || null;

  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;

  while (true) {
    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model, { preferredConnectionId });

    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited) {
        const errorMsg = lastError || credentials.lastError || "Unavailable";
        const status = lastStatus || Number(credentials.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE;
        return unavailableResponse(status, `[${provider}/${model || "video"}] ${errorMsg}`, credentials.retryAfter, credentials.retryAfterHuman);
      }
      if (excludeConnectionIds.size === 0) {
        return errorResponse(HTTP_STATUS.BAD_REQUEST, `No credentials for provider: ${provider}`);
      }
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    const refreshedCredentials = await checkAndRefreshToken(provider, credentials);

    const result = await handleVideoProxyCore({
      provider,
      action,
      rawBody: forwardBody,
      contentType: bodyInfo.contentType || null,
      idempotencyKey,
      credentials: refreshedCredentials,
      signal: request.signal,
      log,
      onCredentialsRefreshed: async (newCreds) => {
        await updateProviderCredentials(credentials.connectionId, {
          accessToken: newCreds.accessToken,
          refreshToken: newCreds.refreshToken,
          providerSpecificData: newCreds.providerSpecificData,
          testStatus: "active",
        });
      },
    });

    if (result.success) {
      await clearAccountError(credentials.connectionId, credentials, model);
      log.info("VIDEO", `${provider.toUpperCase()} | ${action} accepted (connection ${credentials.connectionId})`);
      return withJobHeaders(result.response, credentials.connectionId, provider);
    }

    // Record the failure (dashboard shows lastError/errorCode → user sees re-auth is needed)
    const { shouldFallback } = await markAccountUnavailable(
      credentials.connectionId, result.status, sanitizeSecrets(result.error, refreshedCredentials), provider, model
    );

    if (shouldFallback && CREATE_ROTATION_STATUSES.has(result.status)) {
      excludeConnectionIds.add(credentials.connectionId);
      lastError = result.error;
      lastStatus = result.status;
      continue;
    }

    return result.response;
  }
}

/**
 * GET /v1/videos/{request_id} — poll job status.
 * Jobs are account- and provider-bound upstream, so no rotation here: the caller pins both
 * via `x-connection-id` and `x-provider` (both returned on create). Combos make the provider
 * part load-bearing — a job created on the second combo member is unknown to the first.
 */
export async function handleVideoGet(request, requestId) {
  const authError = await requireValidApiKey(request);
  if (authError) return authError;

  if (!requestId) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing video request id");

  const provider = resolvePollProvider(request.headers.get("x-provider"));
  const preferredConnectionId = request.headers.get("x-connection-id") || null;

  const credentials = await getProviderCredentials(provider, null, null, { preferredConnectionId });
  if (!credentials || credentials.allRateLimited) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, `No credentials for provider: ${provider}`);
  }

  const refreshedCredentials = await checkAndRefreshToken(provider, credentials);

  const result = await handleVideoProxyCore({
    provider,
    requestId,
    credentials: refreshedCredentials,
    signal: request.signal,
    log,
    onCredentialsRefreshed: async (newCreds) => {
      await updateProviderCredentials(credentials.connectionId, {
        accessToken: newCreds.accessToken,
        refreshToken: newCreds.refreshToken,
        providerSpecificData: newCreds.providerSpecificData,
        testStatus: "active",
      });
    },
  });

  if (result.success) {
    await clearAccountError(credentials.connectionId, credentials, null);
    return withJobHeaders(result.response, credentials.connectionId, provider);
  }

  await markAccountUnavailable(
    credentials.connectionId, result.status, sanitizeSecrets(result.error, refreshedCredentials), provider, null
  );
  return result.response;
}
