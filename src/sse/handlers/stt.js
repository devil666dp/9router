import {
  extractApiKey, isValidApiKey,
  getProviderCredentials, markAccountUnavailable,
} from "../services/auth.js";
import { getSettings } from "@/lib/localDb";
import { getModelInfo, getComboModels } from "../services/model.js";
import { handleSttCore } from "open-sse/handlers/sttCore.js";
import { errorResponse, unavailableResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { runMediaCombo } from "../services/mediaCombo.js";
import * as log from "../utils/logger.js";

// Providers requiring credentials for STT
const CREDENTIALED_PROVIDERS = new Set(
  Object.entries(AI_PROVIDERS)
    .filter(([, p]) => p.serviceKinds?.includes("stt") && !p.noAuth && p.sttConfig?.authType !== "none")
    .map(([id]) => id)
);

/**
 * Copy a transcription request into a replayable snapshot.
 *
 * A combo attempt can fail and be retried on the next provider, but a FormData's file part
 * is consumed once it has been sent upstream — the second attempt would post an empty body.
 * The audio is therefore buffered into memory here and a fresh File is minted per attempt.
 * Scalar fields (language, prompt, response_format, temperature, …) are copied verbatim;
 * non-file blobs other than `file` are not part of the transcription contract and are dropped.
 */
async function snapshotSttForm(formData) {
  const file = formData.get("file");
  const bytes = await file.arrayBuffer();
  const fields = [];
  for (const [key, value] of formData.entries()) {
    if (key === "file") continue;
    if (typeof value === "string") fields.push([key, value]);
  }
  return {
    bytes,
    fileName: (typeof file.name === "string" && file.name) || "audio.wav",
    fileType: file.type || "application/octet-stream",
    fields,
  };
}

/**
 * Rebuild a fresh FormData from a snapshot, with `model` set to this attempt's target.
 */
function formDataFromSnapshot(snapshot, modelStr) {
  const fd = new FormData();
  fd.append("file", new File([snapshot.bytes], snapshot.fileName, { type: snapshot.fileType }), snapshot.fileName);
  for (const [key, value] of snapshot.fields) {
    if (key === "model") continue;
    fd.append(key, value);
  }
  fd.append("model", modelStr);
  return fd;
}

export async function handleStt(request) {
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid multipart form data");
  }

  const modelStr = formData.get("model");
  log.request("POST", `/v1/audio/transcriptions | ${modelStr}`);

  const settings = await getSettings();
  if (settings.requireApiKey) {
    const apiKey = extractApiKey(request);
    if (!apiKey) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    const valid = await isValidApiKey(apiKey);
    if (!valid) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
  }

  if (!modelStr) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
  if (!formData.get("file")) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required field: file");

  // Combo expansion: model may be a combo name → run fallback/round-robin across models
  const comboModels = await getComboModels(String(modelStr));
  if (comboModels) {
    const snapshot = await snapshotSttForm(formData);
    return runMediaCombo({
      comboName: String(modelStr),
      models: comboModels,
      settings,
      log,
      tag: "STT",
      // Each attempt gets a freshly built FormData — see snapshotSttForm.
      handleSingleModel: (_body, m) => handleSingleModelStt(formDataFromSnapshot(snapshot, m), m),
    });
  }

  return handleSingleModelStt(formData, String(modelStr));
}

/**
 * Run one STT model through the account-fallback loop.
 * Returns a Response so it can be used as a combo attempt.
 */
async function handleSingleModelStt(formData, modelStr) {
  const modelInfo = await getModelInfo(modelStr);
  if (!modelInfo.provider) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format");

  const { provider, model } = modelInfo;
  log.info("ROUTING", `Provider: ${provider}, Model: ${model}`);

  // noAuth providers
  if (!CREDENTIALED_PROVIDERS.has(provider)) {
    const result = await handleSttCore({ provider, model, formData, sttConfig: AI_PROVIDERS[provider]?.sttConfig });
    if (result.success) return result.response;
    return errorResponse(result.status || HTTP_STATUS.BAD_GATEWAY, result.error || "STT failed");
  }

  // Credentialed — fallback loop
  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;

  while (true) {
    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model);

    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited) {
        const msg = lastError || credentials.lastError || "Unavailable";
        const status = lastStatus || Number(credentials.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE;
        return unavailableResponse(status, `[${provider}/${model}] ${msg}`, credentials.retryAfter, credentials.retryAfterHuman);
      }
      if (excludeConnectionIds.size === 0) return errorResponse(HTTP_STATUS.BAD_REQUEST, `No credentials for provider: ${provider}`);
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    log.info("AUTH", `\x1b[32mUsing ${provider} account: ${credentials.connectionName}\x1b[0m`);

    const result = await handleSttCore({ provider, model, formData, credentials, sttConfig: AI_PROVIDERS[provider]?.sttConfig });

    if (result.success) return result.response;

    const { shouldFallback } = await markAccountUnavailable(credentials.connectionId, result.status, result.error, provider, model);
    if (shouldFallback) {
      excludeConnectionIds.add(credentials.connectionId);
      lastError = result.error;
      lastStatus = result.status;
      continue;
    }
    return result.response || errorResponse(result.status, result.error);
  }
}
