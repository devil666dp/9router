// QwenCloud / DashScope image generation — Singapore (intl) endpoint.
//
// One provider, two API dialects. Every axis that could differ between model
// families turns out to be perfectly correlated with the endpoint, so there are
// exactly two request/response shapes rather than one per family:
//
//   multimodal  POST /services/aigc/multimodal-generation/generation
//               synchronous, `input.messages[0].content[{text},{image}...]`,
//               images at `output.choices[].message.content[].image`.
//               Text-to-image and editing are the SAME call — an edit is just
//               extra {image} parts.
//
//   synthesis   POST /services/aigc/{text2image|image2image}/image-synthesis
//               async only (no sync endpoint exists for these models):
//               `X-DashScope-Async: enable` returns a task id, then
//               GET /tasks/{id} until SUCCEEDED, images at `output.results[].url`.
//               `input.prompt` / `input.images` / `input.negative_prompt`.
//
// PROFILES maps a model id prefix to its dialect plus the per-family deltas
// (allowed DashScope parameters, size policy, `n` ceiling). Unmatched ids fall
// back to `multimodal`: everything DashScope has shipped since Wan 2.6 lives
// there, so a new model works without touching this file.
import { sleep, nowSec, POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from "./_base.js";
import { PROVIDER_MEDIA } from "../../providers/index.js";

const API_ROOT = PROVIDER_MEDIA["qwen"]?.imageConfig?.baseUrl || "https://dashscope-intl.aliyuncs.com/api/v1";

const MULTIMODAL_PATH = "/services/aigc/multimodal-generation/generation";
const TEXT2IMAGE_PATH = "/services/aigc/text2image/image-synthesis";
const IMAGE2IMAGE_PATH = "/services/aigc/image2image/image-synthesis";
const TASK_PATH = "/tasks";

// qwen-image-max/plus/image accept only these five resolutions.
const FIXED_QWEN_SIZES = ["1664*928", "1472*1104", "1328*1328", "1104*1472", "928*1664"];

// Wan 2.7/2.6 accept shorthand resolution tiers in place of width*height.
const SIZE_KEYWORDS = new Set(["1K", "2K", "4K"]);

// Shared parameter sets, named for what they mean rather than for a model.
const QWEN_3_PARAMS = ["negative_prompt", "prompt_extend", "prompt_extend_mode", "enable_thinking", "watermark", "seed"];
const QWEN_2_PARAMS = ["negative_prompt", "prompt_extend", "enable_thinking", "watermark", "seed"];
const QWEN_LEGACY_PARAMS = ["negative_prompt", "prompt_extend", "watermark", "seed"];
const WAN_PARAMS = ["negative_prompt", "prompt_extend", "watermark", "seed"];
const WAN_27_PARAMS = ["thinking_mode", "enable_sequential", "watermark", "seed"];

// Ordered: the first prefix that matches wins, so longer ids are listed before
// the shorter ids they start with (…-edit-plus before …-edit before …-image).
const PROFILES = [
  { prefix: "z-image", dialect: "multimodal", size: "free", maxN: 0, textOnly: true, params: ["prompt_extend", "seed"] },
  { prefix: "qwen-image-3.0", dialect: "multimodal", size: "free", maxN: 6, params: QWEN_3_PARAMS },
  { prefix: "qwen-image-2.0", dialect: "multimodal", size: "free", maxN: 6, params: QWEN_2_PARAMS },
  { prefix: "qwen-image-edit-max", dialect: "multimodal", size: "free", maxN: 6, params: QWEN_2_PARAMS },
  { prefix: "qwen-image-edit-plus", dialect: "multimodal", size: "free", maxN: 6, params: QWEN_2_PARAMS },
  { prefix: "qwen-image-edit", dialect: "multimodal", size: "none", maxN: 1, params: ["negative_prompt", "watermark", "seed"] },
  { prefix: "qwen-image-max", dialect: "multimodal", size: "free", maxN: 1, textOnly: true, params: QWEN_LEGACY_PARAMS },
  { prefix: "qwen-image-plus", dialect: "multimodal", size: "fixed", sizes: FIXED_QWEN_SIZES, maxN: 1, textOnly: true, params: QWEN_LEGACY_PARAMS },
  { prefix: "qwen-image", dialect: "multimodal", size: "fixed", sizes: FIXED_QWEN_SIZES, maxN: 1, textOnly: true, params: QWEN_LEGACY_PARAMS },
  { prefix: "wan2.7-image-pro", dialect: "multimodal", size: "free", maxTier: "4K", maxN: 4, params: WAN_27_PARAMS },
  { prefix: "wan2.7-image", dialect: "multimodal", size: "free", maxTier: "2K", maxN: 4, params: WAN_27_PARAMS },
  { prefix: "wan2.6-image", dialect: "multimodal", size: "free", maxTier: "2K", maxN: 4, params: WAN_PARAMS },
  { prefix: "wan2.6-t2i", dialect: "multimodal", size: "free", maxN: 4, textOnly: true, params: WAN_PARAMS },
  { prefix: "wan2.5-i2i", dialect: "synthesis", path: IMAGE2IMAGE_PATH, size: "free", maxN: 4, params: WAN_PARAMS },
  { prefix: "wan2.5-t2i", dialect: "synthesis", path: TEXT2IMAGE_PATH, size: "free", maxN: 4, textOnly: true, params: WAN_PARAMS },
  { prefix: "wan2.2", dialect: "synthesis", path: TEXT2IMAGE_PATH, size: "free", maxN: 4, textOnly: true, params: WAN_PARAMS },
  { prefix: "wan2.1", dialect: "synthesis", path: TEXT2IMAGE_PATH, size: "free", maxN: 4, textOnly: true, params: WAN_PARAMS },
  { prefix: "wanx2.", dialect: "synthesis", path: TEXT2IMAGE_PATH, size: "free", maxN: 4, textOnly: true, params: WAN_PARAMS },
];

const FALLBACK_PROFILE = { prefix: "", dialect: "multimodal", size: "free", maxN: 4, params: WAN_PARAMS };

// `enable_sequential` (Wan 2.7 image sets) raises the per-request image ceiling.
const SEQUENTIAL_MAX_N = 12;

export function resolveProfile(model) {
  const id = String(model || "");
  return PROFILES.find((p) => id.startsWith(p.prefix)) || FALLBACK_PROFILE;
}

/**
 * Parse an OpenAI-style "WIDTHxHEIGHT" (or DashScope's own "WIDTH*HEIGHT") size.
 * Returns null for anything unparseable, including "auto".
 */
function parseSize(size) {
  const m = /^\s*(\d{2,5})\s*[x*×]\s*(\d{2,5})\s*$/i.exec(String(size || ""));
  if (!m) return null;
  return { w: Number(m[1]), h: Number(m[2]) };
}

/**
 * Clamp a `1K`/`2K`/`4K` tier to the highest one the model accepts.
 * Only wan2.7-image-pro takes 4K; wan2.7-image rejects it outright, so a 4K
 * request is served at 2K rather than 400-ing.
 */
function clampTier(tier, maxTier) {
  if (!maxTier) return tier;
  const order = ["1K", "2K", "4K"];
  const want = order.indexOf(tier);
  const cap = order.indexOf(maxTier);
  if (want < 0 || cap < 0 || want <= cap) return tier;
  return maxTier;
}

/**
 * Pick the legal size closest in aspect ratio to what the caller asked for.
 * Models with a fixed size list reject anything else, so a 1792x1024 request is
 * snapped to the widest legal option rather than 400-ing.
 */
function snapToFixedSize(requested, sizes) {
  const want = parseSize(requested);
  if (!want) return sizes[0];
  const wantRatio = want.w / want.h;
  let best = sizes[0];
  let bestDelta = Infinity;
  for (const candidate of sizes) {
    const dim = parseSize(candidate);
    if (!dim) continue;
    const delta = Math.abs(Math.log(dim.w / dim.h) - Math.log(wantRatio));
    if (delta < bestDelta) {
      bestDelta = delta;
      best = candidate;
    }
  }
  return best;
}

/**
 * Translate the caller's `size` into what this model accepts.
 *
 * - omitted / "auto" → undefined, letting DashScope choose per model default
 * - `size: "none"` profiles (qwen-image-edit) → always undefined; the field is rejected
 * - "1K"/"2K"/"4K" → passed through (Wan 2.7/2.6 shorthand tiers)
 * - fixed-size models → snapped to the nearest legal aspect ratio
 * - everything else → "WIDTH*HEIGHT" (DashScope uses an asterisk, not an "x")
 */
function resolveSize(profile, size) {
  if (profile.size === "none") return undefined;
  if (size === undefined || size === null) return undefined;
  const raw = String(size).trim();
  if (!raw || raw.toLowerCase() === "auto") return undefined;
  if (SIZE_KEYWORDS.has(raw.toUpperCase())) {
    return profile.maxTier ? clampTier(raw.toUpperCase(), profile.maxTier) : undefined;
  }
  if (profile.size === "fixed") return snapToFixedSize(raw, profile.sizes);
  const dim = parseSize(raw);
  if (!dim) return undefined;
  return `${dim.w}*${dim.h}`;
}

/**
 * Number of images to request.
 *
 * DashScope defaults `n` to 4 for several families and bills per generated
 * image, so `n` is always sent explicitly — a bare prompt costs one image, as
 * it does with every other provider here. Values above the model's ceiling are
 * clamped instead of rejected upstream.
 */
function resolveN(profile, body) {
  if (profile.maxN === 0) return undefined;
  const sequential = coerceParam("enable_sequential", body?.enable_sequential ?? false) === true;
  const ceiling = sequential ? SEQUENTIAL_MAX_N : profile.maxN;
  const requested = Number(body?.n);
  if (!Number.isFinite(requested) || requested < 1) return 1;
  return Math.min(Math.floor(requested), ceiling);
}

// DashScope is strict about JSON types: a string "true" is rejected where a
// boolean is expected. The dashboard's select inputs and shell callers both
// produce strings, so declared types are coerced here.
const PARAM_TYPES = {
  negative_prompt: "string",
  prompt_extend: "boolean",
  prompt_extend_mode: "string",
  enable_thinking: "boolean",
  thinking_mode: "boolean",
  enable_sequential: "boolean",
  watermark: "boolean",
  seed: "integer",
};

function coerceParam(key, value) {
  const type = PARAM_TYPES[key];
  if (type === "boolean") {
    if (typeof value === "boolean") return value;
    const s = String(value).toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
    return undefined;
  }
  if (type === "integer") {
    const n = Number(value);
    return Number.isFinite(n) ? Math.floor(n) : undefined;
  }
  return typeof value === "string" ? value : String(value);
}

/**
 * Collect the DashScope-only parameters this model actually accepts.
 * Anything not on the profile's allowlist is dropped rather than forwarded —
 * these APIs reject unknown keys with a 400.
 */
function collectParams(profile, body) {
  const params = {};
  for (const key of profile.params) {
    const value = body?.[key];
    if (value === undefined || value === null || value === "") continue;
    const coerced = coerceParam(key, value);
    if (coerced === undefined) continue;
    params[key] = coerced;
  }
  return params;
}

/** Reference images for an edit request, in the order the caller gave them. */
function collectImages(body) {
  const images = [];
  if (Array.isArray(body?.images)) images.push(...body.images.filter(Boolean));
  if (body?.image) images.push(body.image);
  return images;
}

/**
 * Build the `multimodal` body: prompt and reference images travel together in
 * one user message. Images come first so the trailing text reads as the
 * instruction applied to them, matching the DashScope samples; output aspect
 * ratio follows the last image.
 */
function buildMultimodalBody(model, body, profile) {
  const content = [];
  // z-image-turbo's content array must hold exactly one text part — attaching an image
  // is a hard error upstream, so reference images are dropped for text-only models.
  if (!profile.textOnly) {
    for (const image of collectImages(body)) content.push({ image });
  }
  content.push({ text: body.prompt });

  const parameters = collectParams(profile, body);
  // `prompt_extend_mode: "agent"` is text-to-image only — DashScope 400s if an image is
  // attached. Fall back to the default mode rather than sending a request that cannot succeed.
  if (parameters.prompt_extend_mode === "agent" && content.length > 1) {
    delete parameters.prompt_extend_mode;
  }
  const size = resolveSize(profile, body.size);
  if (size) parameters.size = size;
  const n = resolveN(profile, body);
  if (n !== undefined) parameters.n = n;

  return {
    model,
    input: { messages: [{ role: "user", content }] },
    ...(Object.keys(parameters).length ? { parameters } : {}),
  };
}

/**
 * Build the `synthesis` body: prompt, negative prompt and images are top-level
 * `input` fields, everything else goes under `parameters`.
 */
function buildSynthesisBody(model, body, profile) {
  const input = { prompt: body.prompt };
  // text2image/image-synthesis has no `images` slot — only the wan2.5 editing model does.
  const images = profile.textOnly ? [] : collectImages(body);
  if (images.length) input.images = images;

  const parameters = collectParams(profile, body);
  // negative_prompt belongs to `input` in this dialect, not `parameters`.
  if (parameters.negative_prompt !== undefined) {
    input.negative_prompt = parameters.negative_prompt;
    delete parameters.negative_prompt;
  }
  const size = resolveSize(profile, body.size);
  if (size) parameters.size = size;
  const n = resolveN(profile, body);
  if (n !== undefined) parameters.n = n;

  return {
    model,
    input,
    ...(Object.keys(parameters).length ? { parameters } : {}),
  };
}

/**
 * Poll GET /tasks/{id} until the task leaves PENDING/RUNNING.
 * Returns the raw task payload so `normalize` sees the same `output` shape a
 * synchronous call would produce.
 */
async function pollTask(taskId, headers) {
  const pollHeaders = { ...headers };
  delete pollHeaders["X-DashScope-Async"];
  delete pollHeaders["Content-Type"];

  const url = `${API_ROOT}${TASK_PATH}/${encodeURIComponent(taskId)}`;
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const res = await fetch(url, { headers: pollHeaders });
    if (!res.ok) throw new Error(`Qwen task status ${res.status}`);
    const payload = await res.json();
    const status = payload?.output?.task_status;
    if (status === "SUCCEEDED") return payload;
    if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN") {
      const detail = payload?.output?.message || payload?.message || status;
      throw new Error(`Qwen task ${String(status).toLowerCase()}: ${detail}`);
    }
  }
  throw new Error("Qwen task polling timeout");
}

/**
 * Pull image URLs out of either dialect's result.
 *
 * `output.choices[].message.content[]` (multimodal / Wan 2.6+ tasks) may carry
 * text parts alongside images, so only `image` keys are collected.
 * `output.results[]` (synthesis tasks) may report per-image failures with a
 * `code`/`message` and no `url`; those entries are skipped, and a response with
 * no usable image at all is rejected by the core as a 502.
 */
function extractImageUrls(payload) {
  const urls = [];
  const output = payload?.output;

  for (const choice of output?.choices || []) {
    for (const part of choice?.message?.content || []) {
      if (typeof part?.image === "string" && part.image) urls.push(part.image);
    }
  }
  for (const result of output?.results || []) {
    if (typeof result?.url === "string" && result.url) urls.push(result.url);
  }
  return urls;
}

/** The rewritten prompt, when prompt_extend produced one. */
function revisedPrompt(payload, fallback) {
  const results = payload?.output?.results;
  if (Array.isArray(results)) {
    for (const result of results) {
      if (result?.actual_prompt) return result.actual_prompt;
    }
  }
  return fallback;
}

export default {
  async: true,

  buildUrl: (model) => {
    const profile = resolveProfile(model);
    const path = profile.dialect === "synthesis" ? profile.path : MULTIMODAL_PATH;
    return `${API_ROOT}${path}`;
  },

  buildHeaders: (creds, _requestBody, model) => {
    const headers = { "Content-Type": "application/json" };
    const key = creds?.apiKey || creds?.accessToken;
    if (key) headers["Authorization"] = `Bearer ${key}`;
    // Synthesis models have no synchronous endpoint — the async header is
    // mandatory there and must NOT be sent for the multimodal dialect.
    if (resolveProfile(model).dialect === "synthesis") headers["X-DashScope-Async"] = "enable";
    return headers;
  },

  buildBody: (model, body) => {
    const profile = resolveProfile(model);
    if (profile.dialect === "synthesis") {
      if (profile.path === IMAGE2IMAGE_PATH && collectImages(body).length === 0) {
        throw new Error(`${model} is an image-editing model: provide 'image' or 'images'`);
      }
      return buildSynthesisBody(model, body, profile);
    }
    if (profile.size === "none" && collectImages(body).length === 0) {
      throw new Error(`${model} is an image-editing model: provide 'image' or 'images'`);
    }
    return buildMultimodalBody(model, body, profile);
  },

  /**
   * Multimodal responses are already final. Synthesis responses carry only a
   * task id, so those are polled here and the finished task is returned in its
   * place — `normalize` then handles both without knowing which path ran.
   */
  async parseResponse(response, { headers, model }) {
    const payload = await response.json();

    // A 200 can still carry a DashScope error envelope.
    if (payload?.code && !payload?.output) {
      throw new Error(`${payload.code}: ${payload.message || "Qwen request failed"}`);
    }

    if (resolveProfile(model).dialect !== "synthesis") return payload;

    const taskId = payload?.output?.task_id;
    if (!taskId) throw new Error("Qwen: no task_id returned");
    return pollTask(taskId, headers);
  },

  normalize: (payload, prompt) => {
    const revised = revisedPrompt(payload, prompt);
    return {
      created: nowSec(),
      data: extractImageUrls(payload).map((url) => ({ url, revised_prompt: revised })),
    };
  },
};
