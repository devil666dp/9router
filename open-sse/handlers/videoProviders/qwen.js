// QwenCloud / DashScope video generation — Singapore (intl) endpoint.
//
// Every video model DashScope ships is one async task API: POST to create,
// then GET /tasks/{id} until it leaves PENDING/RUNNING. Only two things vary,
// and PROFILES captures both:
//
//   1. WHERE a media reference lands in `input`. The newest families take a
//      typed `media: [{type, url}]` array; the older ones spell the same
//      references out as named fields (`img_url`, `first_frame_url`,
//      `reference_urls[]`, `image_url` + `video_url`, …). The typed vocabulary
//      is a superset, so it is the canonical form here and each profile
//      declares a `map` from media type → its own field name. `map: null`
//      means the profile takes `media` verbatim.
//
//   2. WHICH scalars `parameters` accepts, and in what units — a `resolution`
//      tier (480P/720P/1080P) or a pixel `size` ("1280*720"). Callers may send
//      either; it is translated to whatever the target model wants.
//
// The client-facing contract is therefore ONE body for all 33 models: `prompt`
// plus optional fields. Anything a model does not accept is dropped rather than
// forwarded (DashScope 400s on unknown keys), so the same request works
// everywhere. Only genuinely required media is enforced, with a 400 naming the
// missing field — see MEDIA_RULES.
import { PROVIDER_MEDIA } from "../../providers/index.js";

const API_ROOT =
  PROVIDER_MEDIA["qwen"]?.videoConfig?.baseUrl || "https://dashscope-intl.aliyuncs.com/api/v1";

const VIDEO_PATH = "/services/aigc/video-generation/video-synthesis";
const IMAGE2VIDEO_PATH = "/services/aigc/image2video/video-synthesis";
const TASK_PATH = "/tasks";

// Canonical media types — DashScope's own newest vocabulary.
export const MEDIA_TYPES = [
  "first_frame",
  "last_frame",
  "first_clip",
  "last_clip",
  "driving_audio",
  "reference_image",
  "reference_video",
  "reference_audio",
  "video",
  "mask_image",
  "mask_video",
  "file",
  "link",
];

// Flat convenience aliases → canonical media type. `audio` is deliberately NOT
// here: it is a boolean parameter on several families, so the audio reference
// keeps DashScope's own `audio_url` name.
const FLAT_MEDIA = {
  first_frame: "first_frame",
  first_frame_url: "first_frame",
  image: "first_frame",
  image_url: "first_frame",
  last_frame: "last_frame",
  last_frame_url: "last_frame",
  first_clip: "first_clip",
  first_clip_url: "first_clip",
  last_clip: "last_clip",
  last_clip_url: "last_clip",
  driving_audio: "driving_audio",
  audio_url: "driving_audio",
  video: "video",
  video_url: "video",
  mask_image: "mask_image",
  mask_image_url: "mask_image",
  mask_video: "mask_video",
  mask_video_url: "mask_video",
};

// Plural flat aliases → canonical type (arrays).
const FLAT_MEDIA_LISTS = {
  reference_images: "reference_image",
  reference_videos: "reference_video",
  reference_urls: "reference_image",
  images: "reference_image",
};

// Pixel size for a resolution tier at a given aspect ratio. The 720P/1080P rows
// are the wan2.7 doc's own table; 480P follows the legacy Wan sizes.
const TIER_SIZES = {
  "480P": { "16:9": "832*480", "9:16": "480*832", "1:1": "624*624", "4:3": "832*624", "3:4": "624*832" },
  "720P": { "16:9": "1280*720", "9:16": "720*1280", "1:1": "960*960", "4:3": "1104*832", "3:4": "832*1104" },
  "1080P": { "16:9": "1920*1080", "9:16": "1080*1920", "1:1": "1440*1440", "4:3": "1648*1248", "3:4": "1248*1648" },
};

const TIER_PIXELS = { "480P": 832 * 480, "720P": 1280 * 720, "1080P": 1920 * 1080 };
const ALL_TIERS = ["480P", "720P", "1080P"];

// ── parameter allowlists ────────────────────────────────────────────────────
// Named for the family, because that is what the docs vary by. Anything absent
// from a profile's list is dropped before the request leaves.
const WAN30_PARAMS = ["resolution", "ratio", "duration", "audio", "prompt_extend", "watermark", "seed"];
const WAN27_I2V_PARAMS = ["resolution", "duration", "prompt_extend", "watermark", "seed"];
const WAN27_RATIO_PARAMS = ["resolution", "ratio", "duration", "prompt_extend", "watermark", "seed"];
const WAN27_EDIT_PARAMS = ["resolution", "ratio", "duration", "audio_setting", "prompt_extend", "watermark", "seed"];
const HH_I2V_PARAMS = ["resolution", "duration", "watermark", "seed"];
const HH_RATIO_PARAMS = ["resolution", "ratio", "duration", "watermark", "seed"];
const HH_EDIT_PARAMS = ["resolution", "audio_setting", "watermark", "seed"];
const I2V_26_FLASH_PARAMS = ["resolution", "duration", "prompt_extend", "shot_type", "audio", "watermark", "seed"];
const I2V_26_PARAMS = ["resolution", "duration", "prompt_extend", "shot_type", "watermark", "seed"];
const LEGACY_I2V_PARAMS = ["resolution", "duration", "prompt_extend", "watermark", "seed"];
const T2V_26_PARAMS = ["size", "duration", "shot_type", "prompt_extend", "negative_prompt", "watermark", "seed"];
const LEGACY_T2V_PARAMS = ["size", "duration", "prompt_extend", "negative_prompt", "watermark", "seed"];
const LEGACY_R2V_PARAMS = ["size", "duration", "audio", "shot_type", "watermark"];
const KF2V_PARAMS = ["resolution", "duration", "prompt_extend", "watermark", "seed"];
const ANIMATE_PARAMS = ["mode", "check_image"];
const VACE_PARAMS = [
  "prompt_extend", "size", "obj_or_bg", "control_condition", "strength",
  "mask_type", "expand_ratio", "top_scale", "bottom_scale", "left_scale", "right_scale",
];

// ── media placement maps ────────────────────────────────────────────────────
// `null` = the family takes the typed `media` array verbatim. Otherwise: media
// type → the `input` field it becomes. A trailing "[]" marks an array field
// that accumulates every reference of that type, in caller order.
const MAP_LEGACY_I2V = { first_frame: "img_url", driving_audio: "audio_url" };
const MAP_LEGACY_T2V = { driving_audio: "audio_url" };
const MAP_LEGACY_R2V = { reference_image: "reference_urls[]", reference_video: "reference_urls[]" };
const MAP_KF2V = { first_frame: "first_frame_url", last_frame: "last_frame_url" };
const MAP_ANIMATE = { first_frame: "image_url", reference_video: "video_url", video: "video_url" };
const MAP_VACE = {
  reference_image: "ref_images_url[]",
  video: "video_url",
  reference_video: "video_url",
  mask_image: "mask_image_url",
  mask_video: "mask_video_url",
  first_clip: "first_clip_url",
  last_clip: "last_clip_url",
  first_frame: "first_frame_url",
  last_frame: "last_frame_url",
};

// Ordered: first matching prefix wins, so longer ids precede the shorter
// prefixes they start with (…-i2v-flash before …-i2v).
const PROFILES = [
  // ── Wan 3.0 — all-in-one; `prompt` OR `media` ────────────────────────────
  {
    prefix: "wan3.0-video", path: VIDEO_PATH, params: WAN30_PARAMS,
    sizeMode: "tier", tiers: ALL_TIERS, ratios: ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"],
    duration: { min: 2, max: 30, smart: true },
    media: null,
    mediaTypes: ["first_frame", "last_frame", "reference_image", "reference_video", "reference_audio", "file", "link"],
    negativePrompt: "input", extraInput: ["reference_voice"],
    typeAliases: { driving_audio: "reference_audio", video: "reference_video", first_clip: "reference_video" },
    exclusiveGroups: [["reference_image", "reference_video", "reference_audio", "file", "link"], ["first_frame", "last_frame"]],
    requires: { anyOf: [["prompt"], ["media"]] },
  },

  // ── Wan 2.7 ──────────────────────────────────────────────────────────────
  {
    prefix: "wan2.7-i2v", path: VIDEO_PATH, params: WAN27_I2V_PARAMS,
    sizeMode: "tier", tiers: ["720P", "1080P"], duration: { min: 2, max: 15 },
    negativePrompt: "input",
    media: null,
    mediaTypes: ["first_frame", "last_frame", "driving_audio", "first_clip"],
    mediaOnce: true,
    mediaCombos: [
      ["first_frame"],
      ["first_frame", "driving_audio"],
      ["first_frame", "last_frame"],
      ["first_frame", "last_frame", "driving_audio"],
      ["first_clip"],
      ["first_clip", "last_frame"],
    ],
    requires: { anyOf: [["first_frame"], ["first_clip"]] },
  },
  {
    prefix: "wan2.7-t2v", path: VIDEO_PATH, params: WAN27_RATIO_PARAMS,
    sizeMode: "tier", tiers: ["720P", "1080P"], ratios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    duration: { min: 2, max: 15 }, negativePrompt: "input", media: null, mediaTypes: [],
  },
  {
    prefix: "wan2.7-r2v", path: VIDEO_PATH, params: WAN27_RATIO_PARAMS,
    sizeMode: "tier", tiers: ["720P", "1080P"], ratios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    duration: { min: 2, max: 15 }, negativePrompt: "input",
    media: null, mediaTypes: ["reference_image", "reference_video", "first_frame"],
    mediaMax: 5, extraInput: ["reference_voice"],
    typeAliases: { video: "reference_video" },
    requires: { anyOf: [["reference_image"], ["reference_video"]] },
  },
  {
    prefix: "wan2.7-videoedit", path: VIDEO_PATH, params: WAN27_EDIT_PARAMS,
    sizeMode: "tier", tiers: ["720P", "1080P"], ratios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    duration: { min: 0, max: 10 }, negativePrompt: "input",
    media: null, mediaTypes: ["video", "reference_image"],
    typeAliases: { reference_video: "video" },
    requires: { allOf: ["video"] },
  },

  // ── HappyHorse — no negative_prompt, no prompt_extend, watermark ON ──────
  {
    prefix: "happyhorse-1.1-i2v", path: VIDEO_PATH, params: HH_I2V_PARAMS,
    sizeMode: "tier", tiers: ALL_TIERS, duration: { min: 3, max: 15 },
    media: null, mediaTypes: ["first_frame"], mediaOnce: true,
    requires: { allOf: ["first_frame"] },
  },
  {
    prefix: "happyhorse-1.1-t2v", path: VIDEO_PATH, params: HH_RATIO_PARAMS,
    sizeMode: "tier", tiers: ALL_TIERS,
    ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "4:5", "5:4", "9:21", "21:9"],
    duration: { min: 3, max: 15 }, media: null, mediaTypes: [],
  },
  {
    prefix: "happyhorse-1.1-r2v", path: VIDEO_PATH, params: HH_RATIO_PARAMS,
    sizeMode: "tier", tiers: ALL_TIERS,
    ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "4:5", "5:4", "9:21", "21:9"],
    duration: { min: 3, max: 15 },
    media: null, mediaTypes: ["reference_image"], mediaMax: 9,
    typeAliases: { first_frame: "reference_image" },
    requires: { allOf: ["reference_image"] },
  },
  {
    prefix: "happyhorse-1.0-video-edit", path: VIDEO_PATH, params: HH_EDIT_PARAMS,
    sizeMode: "tier", tiers: ["720P", "1080P"],
    media: null, mediaTypes: ["video", "reference_image"],
    typeAliases: { reference_video: "video" },
    requires: { allOf: ["video"] },
  },

  // ── Wan 2.6/2.5/2.2/2.1 image-to-video (first frame) ─────────────────────
  {
    prefix: "wan2.6-i2v-flash", path: VIDEO_PATH, params: I2V_26_FLASH_PARAMS,
    sizeMode: "tier", tiers: ["720P", "1080P"], duration: { min: 2, max: 15 },
    negativePrompt: "input", media: MAP_LEGACY_I2V,
    mediaTypes: ["first_frame", "driving_audio"], mediaOnce: true,
    requires: { allOf: ["first_frame"] },
  },
  {
    prefix: "wan2.6-i2v", path: VIDEO_PATH, params: I2V_26_PARAMS,
    sizeMode: "tier", tiers: ["720P", "1080P"], duration: { min: 2, max: 15 },
    negativePrompt: "input", media: MAP_LEGACY_I2V,
    mediaTypes: ["first_frame", "driving_audio"], mediaOnce: true,
    requires: { allOf: ["first_frame"] },
  },
  {
    prefix: "wan2.5-i2v", path: VIDEO_PATH, params: LEGACY_I2V_PARAMS,
    sizeMode: "tier", tiers: ALL_TIERS, duration: { values: [5, 10] },
    negativePrompt: "input", media: MAP_LEGACY_I2V,
    mediaTypes: ["first_frame", "driving_audio"], mediaOnce: true,
    requires: { allOf: ["first_frame"] },
  },
  {
    prefix: "wan2.2-i2v-plus", path: VIDEO_PATH, params: LEGACY_I2V_PARAMS,
    sizeMode: "tier", tiers: ["480P", "1080P"], duration: { fixed: 5 },
    negativePrompt: "input", media: MAP_LEGACY_I2V,
    mediaTypes: ["first_frame"], mediaOnce: true,
    requires: { allOf: ["first_frame"] },
  },
  {
    prefix: "wan2.2-i2v", path: VIDEO_PATH, params: LEGACY_I2V_PARAMS,
    sizeMode: "tier", tiers: ALL_TIERS, duration: { fixed: 5 },
    negativePrompt: "input", media: MAP_LEGACY_I2V,
    mediaTypes: ["first_frame"], mediaOnce: true,
    requires: { allOf: ["first_frame"] },
  },
  {
    prefix: "wan2.1-i2v-turbo", path: VIDEO_PATH, params: LEGACY_I2V_PARAMS,
    sizeMode: "tier", tiers: ["480P", "720P"], duration: { values: [3, 4, 5] },
    negativePrompt: "input", media: MAP_LEGACY_I2V,
    mediaTypes: ["first_frame"], mediaOnce: true,
    requires: { allOf: ["first_frame"] },
  },
  {
    prefix: "wan2.1-i2v", path: VIDEO_PATH, params: LEGACY_I2V_PARAMS,
    sizeMode: "tier", tiers: ["720P"], duration: { fixed: 5 },
    negativePrompt: "input", media: MAP_LEGACY_I2V,
    mediaTypes: ["first_frame"], mediaOnce: true,
    requires: { allOf: ["first_frame"] },
  },

  // ── Wan first + last frame (kf2v) — separate image2video endpoint ────────
  {
    prefix: "wan2.2-kf2v", path: IMAGE2VIDEO_PATH, params: KF2V_PARAMS,
    sizeMode: "tier", tiers: ALL_TIERS, duration: { fixed: 5 },
    negativePrompt: "input", media: MAP_KF2V,
    mediaTypes: ["first_frame", "last_frame"], mediaOnce: true,
    requires: { allOf: ["first_frame", "last_frame"] },
  },
  {
    prefix: "wan2.1-kf2v", path: IMAGE2VIDEO_PATH, params: KF2V_PARAMS,
    sizeMode: "tier", tiers: ALL_TIERS, duration: { fixed: 5 },
    negativePrompt: "input", media: MAP_KF2V,
    mediaTypes: ["first_frame", "last_frame"], mediaOnce: true,
    requires: { allOf: ["first_frame", "last_frame"] },
  },

  // ── Wan 2.6 reference-to-video — pixel `size`, no negative_prompt ────────
  {
    prefix: "wan2.6-r2v", path: VIDEO_PATH, params: LEGACY_R2V_PARAMS,
    sizeMode: "pixel", sizes: ["1280*720", "720*1280", "960*960", "1920*1080", "1080*1920"],
    duration: { min: 2, max: 10 }, media: MAP_LEGACY_R2V,
    mediaTypes: ["reference_image", "reference_video"], mediaMax: 5,
    typeAliases: { first_frame: "reference_image", video: "reference_video" },
    requires: { anyOf: [["reference_image"], ["reference_video"]] },
  },

  // ── Wan text-to-video (2.6 and earlier) — pixel `size` ───────────────────
  {
    prefix: "wan2.6-t2v", path: VIDEO_PATH, params: T2V_26_PARAMS,
    sizeMode: "pixel", sizes: ["1280*720", "1920*1080"], duration: { min: 2, max: 15 },
    media: MAP_LEGACY_T2V, mediaTypes: ["driving_audio"], mediaOnce: true,
  },
  {
    prefix: "wan2.5-t2v", path: VIDEO_PATH, params: LEGACY_T2V_PARAMS,
    sizeMode: "pixel", sizes: ["832*480", "1280*720", "1920*1080"], duration: { values: [5, 10] },
    media: MAP_LEGACY_T2V, mediaTypes: ["driving_audio"], mediaOnce: true,
  },
  {
    prefix: "wan2.2-t2v", path: VIDEO_PATH, params: LEGACY_T2V_PARAMS,
    sizeMode: "pixel", sizes: ["832*480", "1920*1080"], duration: { fixed: 5 },
    media: MAP_LEGACY_T2V, mediaTypes: [], mediaOnce: true,
  },
  {
    prefix: "wan2.1-t2v-turbo", path: VIDEO_PATH, params: LEGACY_T2V_PARAMS,
    sizeMode: "pixel", sizes: ["832*480", "1280*720"], duration: { fixed: 5 },
    media: MAP_LEGACY_T2V, mediaTypes: [],
  },
  {
    prefix: "wan2.1-t2v", path: VIDEO_PATH, params: LEGACY_T2V_PARAMS,
    sizeMode: "pixel", sizes: ["1280*720"], duration: { fixed: 5 },
    media: MAP_LEGACY_T2V, mediaTypes: [],
  },

  // ── Wan animate — image + driving video, `mode` is REQUIRED upstream ─────
  {
    prefix: "wan2.2-animate-move", path: IMAGE2VIDEO_PATH, params: ANIMATE_PARAMS,
    sizeMode: "none", media: MAP_ANIMATE,
    mediaTypes: ["first_frame", "reference_video"], mediaOnce: true,
    requiredParams: { mode: "wan-std" }, inputFlags: ["watermark"], noPrompt: true,
    typeAliases: { video: "reference_video" },
    requires: { allOf: ["first_frame", "reference_video"] },
  },
  {
    prefix: "wan2.2-animate-mix", path: IMAGE2VIDEO_PATH, params: ANIMATE_PARAMS,
    sizeMode: "none", media: MAP_ANIMATE,
    mediaTypes: ["first_frame", "reference_video"], mediaOnce: true,
    requiredParams: { mode: "wan-std" }, inputFlags: ["watermark"], noPrompt: true,
    typeAliases: { video: "reference_video" },
    requires: { allOf: ["first_frame", "reference_video"] },
  },

  // ── Wan VACE general video editing — `function` selects the capability ───
  {
    prefix: "wan2.1-vace", path: VIDEO_PATH, params: VACE_PARAMS,
    sizeMode: "pixel", media: MAP_VACE,
    mediaTypes: ["reference_image", "video", "mask_image", "mask_video", "first_clip", "last_clip", "first_frame", "last_frame"],
    vace: true, extraInput: ["function", "mask_frame_id"],
    requires: { anyOf: [["reference_image"], ["video"], ["reference_video"]] },
  },
];

// Unknown ids get the newest all-in-one shape: `media` verbatim on the video
// endpoint with the Wan 3.0 parameter set, so a model DashScope ships tomorrow
// works without editing this file.
const FALLBACK_PROFILE = {
  prefix: "", path: VIDEO_PATH, params: WAN30_PARAMS,
  sizeMode: "tier", tiers: ALL_TIERS, ratios: ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"],
  duration: { min: 2, max: 30, smart: true }, media: null, mediaTypes: MEDIA_TYPES,
};

export function resolveProfile(model) {
  const id = String(model || "");
  return PROFILES.find((p) => id.startsWith(p.prefix)) || FALLBACK_PROFILE;
}

// -- media collection --------------------------------------------------------

/**
 * Gather every media reference the caller supplied, in canonical typed form.
 *
 * Two spellings are accepted and merged, so callers can use whichever is
 * natural: the typed `media: [{type, url}]` array DashScope's newest models
 * take, and flat convenience fields (`image`, `last_frame`, `audio_url`,
 * `video`, `reference_images[]`, ...). Typed entries come first, so an explicit
 * `media` entry wins over a flat alias for the same slot.
 */
function collectMedia(body) {
  const items = [];
  const push = (type, url) => {
    if (!type) return;
    const value = typeof url === "string" ? url.trim() : url?.url;
    if (typeof value !== "string" || !value) return;
    items.push({ type, url: value });
  };

  for (const entry of Array.isArray(body?.media) ? body.media : []) {
    if (typeof entry === "string") {
      push("reference_image", entry);
      continue;
    }
    const type = FLAT_MEDIA[entry?.type] || entry?.type;
    push(type, entry?.url || entry?.image_url || entry?.video_url || entry?.audio_url);
  }

  for (const [key, type] of Object.entries(FLAT_MEDIA)) {
    const value = body?.[key];
    if (Array.isArray(value)) {
      for (const one of value) push(type, one);
    } else {
      push(type, value);
    }
  }

  for (const [key, type] of Object.entries(FLAT_MEDIA_LISTS)) {
    const value = body?.[key];
    if (Array.isArray(value)) {
      for (const one of value) push(type, one);
    } else {
      push(type, value);
    }
  }

  // The same url in the same slot twice (e.g. `image` and `first_frame_url`) is
  // one reference, not two.
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.type} ${item.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Fold the caller's types into the vocabulary this model actually accepts.
 *
 * This is what lets one request body work everywhere: a caller who sends
 * `image` means "the picture to animate", which is a `first_frame` on Wan 2.7
 * and a `reference_image` on HappyHorse r2v. `typeAliases` records that
 * per-profile equivalence; anything still outside `mediaTypes` afterwards is
 * genuinely unsupported by the model and is dropped rather than 400-ing, so a
 * combo can fall through to a model that does support it.
 */
function adaptMediaTypes(items, profile) {
  const allowed = new Set(profile.mediaTypes || MEDIA_TYPES);
  const aliases = profile.typeAliases || {};
  const out = [];
  for (const item of items) {
    let type = item.type;
    if (!allowed.has(type) && aliases[type]) type = aliases[type];
    if (!allowed.has(type)) continue;
    out.push({ type, url: item.url });
  }
  // Keep only the first reference per type where the model takes one.
  if (!profile.mediaOnce) return out;
  const used = new Set();
  return out.filter((item) => {
    if (used.has(item.type)) return false;
    used.add(item.type);
    return true;
  });
}

// Field names to name in a validation message — the flat spelling a caller is
// most likely to have reached for, rather than the internal canonical type.
const MEDIA_HINTS = {
  first_frame: "'image' (first frame)",
  last_frame: "'last_frame'",
  first_clip: "'first_clip' (input video clip)",
  driving_audio: "'audio_url'",
  reference_image: "'reference_images' (reference image)",
  reference_video: "'video'",
  reference_audio: "'audio_url'",
  video: "'video'",
  media: "at least one media reference",
  prompt: "'prompt'",
};

/**
 * Reject media combinations the model cannot serve, before the request leaves.
 *
 * These are validated here rather than upstream because DashScope accepts the
 * create call and only reports the problem as a FAILED task minutes later —
 * after the caller has waited, and in some cases after being billed. A local
 * 400 naming the offending field is both faster and cheaper.
 *
 * Only hard structural rules are enforced. Anything the model merely ignores is
 * left alone, and anything absent is fine unless `requires` says otherwise.
 *
 * @throws {Error} with a caller-facing message
 */
function validateMedia(items, profile, model, body) {
  const present = new Set(items.map((item) => item.type));

  // Mutually exclusive groups (Wan 3.0: reference/file/link vs first/last frame).
  // At most one group may be represented; types in no group are unconstrained.
  const touched = (profile.exclusiveGroups || [])
    .map((group) => group.filter((type) => present.has(type)))
    .filter((hit) => hit.length);
  if (touched.length > 1) {
    const groups = touched.map((hit) => `[${hit.join(", ")}]`).join(" with ");
    throw new Error(`${model}: media types cannot combine ${groups}`);
  }

  // Total reference count (r2v families cap at 5 or 9).
  if (profile.mediaMax && items.length > profile.mediaMax) {
    throw new Error(`${model}: at most ${profile.mediaMax} media references (received ${items.length})`);
  }

  // Explicit legal-combination table (wan2.7-i2v has exactly six).
  if (profile.mediaCombos && items.length) {
    const key = [...present].sort().join("+");
    const legal = profile.mediaCombos.some((combo) => [...combo].sort().join("+") === key);
    if (!legal) {
      const shapes = profile.mediaCombos.map((combo) => `[${combo.join(" + ")}]`).join(", ");
      throw new Error(`${model}: media combination [${[...present].join(" + ")}] is not supported. Supported: ${shapes}`);
    }
  }

  // Required inputs. `allOf` names every type that must be present; `anyOf`
  // lists alternative sets, one of which must be satisfied.
  const satisfied = (type) => (type === "prompt" ? !!body?.prompt : type === "media" ? items.length > 0 : present.has(type));
  for (const type of profile.requires?.allOf || []) {
    if (!satisfied(type)) throw new Error(`${model} requires ${MEDIA_HINTS[type] || type}`);
  }
  const anyOf = profile.requires?.anyOf;
  if (anyOf && !anyOf.some((set) => set.every(satisfied))) {
    const options = [...new Set(anyOf.map((set) => set.map((type) => MEDIA_HINTS[type] || type).join(" + ")))];
    throw new Error(`${model} requires ${options.join(" or ")}`);
  }
}

// -- size, ratio and duration ------------------------------------------------

/** Parse "WIDTHxHEIGHT" or DashScope's own "WIDTH*HEIGHT". Null if unparseable. */
function parseSize(size) {
  const m = /^\s*(\d{2,5})\s*[x*]\s*(\d{2,5})\s*$/i.exec(String(size || ""));
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}

/** "1080P" / "1080p" / "1080" -> "1080P". Null for anything else. */
function parseTier(value) {
  const m = /^\s*(480|720|1080)\s*p?\s*$/i.exec(String(value || ""));
  return m ? `${m[1]}P` : null;
}

/** Nearest ratio label for a pixel size, so a `size` can drive a `ratio` field. */
function ratioForSize(dim, ratios) {
  const want = Math.log(dim.w / dim.h);
  let best = null;
  let bestDelta = Infinity;
  for (const label of ratios) {
    if (label === "adaptive") continue;
    const [a, b] = label.split(":").map(Number);
    if (!a || !b) continue;
    const delta = Math.abs(Math.log(a / b) - want);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = label;
    }
  }
  return best;
}

/** The accepted tier whose pixel count is closest to `pixels`. */
function nearestTier(pixels, tiers) {
  let best = tiers[0];
  let bestDelta = Infinity;
  for (const tier of tiers) {
    const delta = Math.abs(Math.log(TIER_PIXELS[tier] / pixels));
    if (delta < bestDelta) {
      bestDelta = delta;
      best = tier;
    }
  }
  return best;
}

/** Clamp a tier into the list this model accepts, preferring the nearest one. */
function clampTier(tier, tiers) {
  return tiers.includes(tier) ? tier : nearestTier(TIER_PIXELS[tier], tiers);
}

/** Pick the legal pixel size closest in aspect ratio, then in area. */
function snapToFixedSize(dim, sizes) {
  const want = Math.log(dim.w / dim.h);
  const area = dim.w * dim.h;
  let best = sizes[0];
  let bestKey = [Infinity, Infinity];
  for (const candidate of sizes) {
    const cand = parseSize(candidate);
    if (!cand) continue;
    const key = [Math.abs(Math.log(cand.w / cand.h) - want), Math.abs(Math.log((cand.w * cand.h) / area))];
    if (key[0] < bestKey[0] - 1e-6 || (Math.abs(key[0] - bestKey[0]) <= 1e-6 && key[1] < bestKey[1])) {
      bestKey = key;
      best = candidate;
    }
  }
  return best;
}

/**
 * Translate the caller's size/resolution/ratio into what this model wants.
 *
 * Callers may send any of `size` ("1280x720"), `resolution` ("720P") and
 * `ratio` ("16:9") — the three are cross-derived here so one request body works
 * against both dialects:
 *
 *   tier models  <- resolution, or the tier nearest a pixel `size`;
 *                   plus `ratio` when the model has one, derived from `size`
 *                   if the caller only gave that.
 *   pixel models <- size, or the tier+ratio looked up in TIER_SIZES; snapped to
 *                   the model's legal list when it has one.
 *
 * Out-of-range values are clamped rather than rejected: a 4K request is served
 * at the model's best tier instead of 400-ing.
 */
function resolveGeometry(profile, body, parameters) {
  if (profile.sizeMode === "none") return;

  const dim = parseSize(body?.size);
  const tier = parseTier(body?.resolution) || (dim ? null : parseTier(body?.size));
  const ratio = typeof body?.ratio === "string" && body.ratio.trim() ? body.ratio.trim() : null;

  if (profile.sizeMode === "tier") {
    const tiers = profile.tiers || ALL_TIERS;
    const chosen = tier ? clampTier(tier, tiers) : dim ? nearestTier(dim.w * dim.h, tiers) : null;
    if (chosen) parameters.resolution = chosen;

    if (profile.ratios) {
      const wanted = ratio && profile.ratios.includes(ratio) ? ratio : dim ? ratioForSize(dim, profile.ratios) : null;
      if (wanted) parameters.ratio = wanted;
    }
    return;
  }

  // Pixel `size` dialect. With nothing requested at all, `size` is left off so
  // DashScope applies its own per-model default.
  let target = dim;
  if (!target) {
    if (!tier && !ratio) return;
    const row = TIER_SIZES[tier || "720P"];
    const label = ratio && row?.[ratio] ? ratio : "16:9";
    target = parseSize(row?.[label]);
  }
  if (!target) return;
  parameters.size = profile.sizes ? snapToFixedSize(target, profile.sizes) : `${target.w}*${target.h}`;
}

/**
 * Clamp `duration` to what the model accepts.
 *
 * Every family states its own rule — a range, an enum, or a single fixed value —
 * and rejects anything else. A caller asking for 20 s from a 5 s-only model gets
 * 5 s rather than a 400. Wan 3.0's `-1` (let the model choose) is passed through.
 */
function resolveDuration(profile, value) {
  const rule = profile.duration;
  if (!rule) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const seconds = Math.round(n);
  if (rule.smart && seconds === -1) return -1;
  if (rule.fixed !== undefined) return rule.fixed;
  if (rule.values) {
    return rule.values.reduce((best, option) => (Math.abs(option - seconds) < Math.abs(best - seconds) ? option : best), rule.values[0]);
  }
  return Math.min(Math.max(seconds, rule.min), rule.max);
}

// -- scalar parameters -------------------------------------------------------

// DashScope is strict about JSON types: a string "true" is rejected where a
// boolean is expected. The dashboard's select inputs and shell callers both
// produce strings, so declared types are coerced.
const PARAM_TYPES = {
  resolution: "string",
  ratio: "string",
  size: "string",
  duration: "integer",
  audio: "boolean",
  audio_setting: "string",
  shot_type: "string",
  prompt_extend: "boolean",
  negative_prompt: "string",
  watermark: "boolean",
  seed: "integer",
  mode: "string",
  check_image: "boolean",
  obj_or_bg: "array",
  control_condition: "string",
  strength: "number",
  mask_type: "string",
  expand_ratio: "number",
  top_scale: "number",
  bottom_scale: "number",
  left_scale: "number",
  right_scale: "number",
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
    return Number.isFinite(n) ? Math.round(n) : undefined;
  }
  if (type === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  if (type === "array") {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    const parts = String(value).split(",").map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts : undefined;
  }
  return typeof value === "string" ? value : String(value);
}

/**
 * Collect the parameters this model actually accepts.
 *
 * The allowlist is the whole point of the "one common API" contract: a caller
 * may send `shot_type` and `audio_setting` in the same body, and each model
 * receives only the one it knows about. Forwarding the rest would 400 upstream.
 *
 * `resolution`/`ratio`/`size`/`duration` are handled by the geometry and
 * duration helpers instead, since they need translating rather than copying.
 */
const GEOMETRY_KEYS = new Set(["resolution", "ratio", "size", "duration"]);

function collectParams(profile, body) {
  const parameters = {};
  for (const key of profile.params) {
    if (GEOMETRY_KEYS.has(key)) continue;
    const value = body?.[key];
    if (value === undefined || value === null || value === "") continue;
    const coerced = coerceParam(key, value);
    if (coerced === undefined) continue;
    parameters[key] = coerced;
  }
  return parameters;
}

// -- body construction -------------------------------------------------------

/**
 * Place typed media references into `input`, per the profile's map.
 *
 * `map: null` families take the typed array verbatim; the rest name each
 * reference (`img_url`, `first_frame_url`, `reference_urls[]`, ...). A trailing
 * "[]" in the map marks an array field that accumulates every reference of that
 * type in caller order.
 */
function placeMedia(input, items, profile) {
  if (!items.length) return;
  if (!profile.media) {
    input.media = items.map((item) => ({ type: item.type, url: item.url }));
    return;
  }
  for (const item of items) {
    const target = profile.media[item.type];
    if (!target) continue;
    if (target.endsWith("[]")) {
      const field = target.slice(0, -2);
      (input[field] ||= []).push(item.url);
    } else if (input[target] === undefined) {
      input[target] = item.url;
    }
  }
}

/**
 * VACE's `function` selects which capability runs, and each one reads a
 * different subset of the reference fields. It is required upstream, so it is
 * inferred from the media the caller supplied when they did not name it:
 * reference images alone mean image_reference, a video plus a mask means
 * video_repainting, a video plus reference images means video_edit, and a bare
 * video means video_extension.
 */
function inferVaceFunction(input) {
  const hasVideo = !!input.video_url;
  const hasRefs = Array.isArray(input.ref_images_url) && input.ref_images_url.length > 0;
  const hasMask = !!input.mask_image_url || !!input.mask_video_url;
  if (!hasVideo) return "image_reference";
  if (hasMask) return "video_repainting";
  if (hasRefs) return "video_edit";
  return "video_extension";
}

/**
 * Build the DashScope create-task body for any model.
 *
 * One shape, driven entirely by the profile:
 *   { model, input: { prompt?, <media placement>, ... }, parameters: { ... } }
 *
 * `negative_prompt` moves between `input` and `parameters` depending on the
 * family, `watermark` is an `input` field on the animate models, and the
 * remaining `input`-level extras (`reference_voice`, `function`,
 * `mask_frame_id`) are copied through when the profile declares them.
 */
export function buildCreateBody(model, body) {
  const profile = resolveProfile(model);
  const items = adaptMediaTypes(collectMedia(body), profile);
  validateMedia(items, profile, model, body);

  const input = {};
  if (!profile.noPrompt && body?.prompt) input.prompt = body.prompt;
  placeMedia(input, items, profile);

  const parameters = collectParams(profile, body);

  // negative_prompt belongs to `input` in the newer dialects and to
  // `parameters` in the legacy text-to-video one.
  if (profile.negativePrompt === "input") {
    if (typeof body?.negative_prompt === "string" && body.negative_prompt) {
      input.negative_prompt = body.negative_prompt;
    }
    delete parameters.negative_prompt;
  }

  // The animate models read `watermark` from `input`, not `parameters`.
  for (const key of profile.inputFlags || []) {
    const coerced = body?.[key] === undefined ? undefined : coerceParam(key, body[key]);
    if (coerced !== undefined) input[key] = coerced;
  }

  for (const key of profile.extraInput || []) {
    const value = body?.[key];
    if (value === undefined || value === null || value === "") continue;
    input[key] = key === "mask_frame_id" ? Math.round(Number(value)) : value;
  }

  if (profile.vace && !input.function) input.function = inferVaceFunction(input);

  resolveGeometry(profile, body, parameters);
  const duration = resolveDuration(profile, body?.duration);
  if (duration !== undefined && profile.params.includes("duration")) parameters.duration = duration;

  // Parameters the model rejects the request without (animate's `mode`).
  for (const [key, fallback] of Object.entries(profile.requiredParams || {})) {
    if (parameters[key] === undefined) parameters[key] = fallback;
  }

  return {
    model,
    input,
    ...(Object.keys(parameters).length ? { parameters } : {}),
  };
}

// -- introspection -----------------------------------------------------------

// Client-facing field name for each canonical media type. This is the flat
// spelling the dashboard renders and the docs advertise; `collectMedia` accepts
// several aliases for each, but exactly one is named here.
const MEDIA_FIELDS = {
  first_frame: "image",
  last_frame: "last_frame",
  first_clip: "first_clip",
  last_clip: "last_clip",
  driving_audio: "audio_url",
  reference_audio: "audio_url",
  reference_image: "reference_images",
  reference_video: "video",
  video: "video",
  mask_image: "mask_image",
  mask_video: "mask_video",
  file: "reference_images",
  link: "reference_images",
};

/**
 * Every request field this model accepts, in one flat list.
 *
 * The provider registry stores this per model so the dashboard can gate its
 * inputs, and generating it from the same PROFILES table the request builder
 * uses is what keeps the two from drifting apart.
 */
export function modelFields(model) {
  const profile = resolveProfile(model);
  const fields = [];
  const add = (key) => {
    if (key && !fields.includes(key)) fields.push(key);
  };

  if (!profile.noPrompt) add("prompt");
  if (profile.negativePrompt === "input" || profile.params.includes("negative_prompt")) add("negative_prompt");

  for (const type of profile.mediaTypes || MEDIA_TYPES) add(MEDIA_FIELDS[type]);
  for (const key of profile.extraInput || []) add(key);
  for (const key of profile.inputFlags || []) add(key);

  for (const key of profile.params) {
    if (key === "negative_prompt") continue;
    add(key);
  }
  // Both geometry spellings are accepted everywhere and cross-translated, so
  // both are offered regardless of which one the model itself takes.
  if (profile.sizeMode === "tier") add("size");
  if (profile.sizeMode === "pixel") add("resolution");
  if (profile.sizeMode !== "none" && !profile.ratios && profile.sizeMode === "pixel") add("ratio");

  return fields;
}

// -- response normalization --------------------------------------------------

// DashScope task states -> the status vocabulary the video endpoints already
// publish (xAI's shape), so a client polls one contract regardless of provider.
const STATUS_MAP = {
  PENDING: "pending",
  RUNNING: "processing",
  SUCCEEDED: "done",
  FAILED: "failed",
  CANCELED: "failed",
  UNKNOWN: "failed",
};

/**
 * The finished video's URL.
 *
 * Most families answer with `output.video_url`; image-to-animation and
 * character-swap nest it under `output.results` (an object, not an array).
 */
function extractVideoUrl(payload) {
  const output = payload?.output;
  if (typeof output?.video_url === "string" && output.video_url) return output.video_url;
  const results = output?.results;
  if (typeof results?.video_url === "string" && results.video_url) return results.video_url;
  if (Array.isArray(results)) {
    for (const entry of results) {
      if (typeof entry?.video_url === "string" && entry.video_url) return entry.video_url;
    }
  }
  return null;
}

/** Create-task response -> `{ request_id }`, the id the client then polls. */
export function normalizeCreate(payload) {
  const taskId = payload?.output?.task_id;
  if (!taskId) {
    const detail = payload?.output?.message || payload?.message || payload?.code || "no task_id returned";
    throw new Error(`Qwen video: ${detail}`);
  }
  return { request_id: taskId, id: taskId, status: STATUS_MAP[payload?.output?.task_status] || "pending" };
}

/**
 * Task-status response -> the poll shape clients already expect from /v1/videos.
 *
 * `usage` and the extended prompt are carried through under their DashScope
 * names so nothing is lost for callers who want them, but the fields that
 * matter (`status`, `video.url`, `error`) are always in the standard place.
 */
export function normalizePoll(payload) {
  const output = payload?.output || {};
  const status = STATUS_MAP[output.task_status] || "processing";
  const url = extractVideoUrl(payload);
  const usage = payload?.usage || {};
  const duration = Number(usage.output_video_duration ?? usage.video_duration ?? usage.duration);

  const normalized = {
    id: output.task_id,
    request_id: output.task_id || payload?.request_id,
    status,
    ...(output.task_status ? { task_status: output.task_status } : {}),
  };

  if (url) {
    normalized.video = { url, ...(Number.isFinite(duration) ? { duration } : {}) };
  }
  if (status === "failed") {
    normalized.error = {
      code: output.code || payload?.code || "task_failed",
      message: output.message || payload?.message || `Qwen video task ${output.task_status || "failed"}`,
    };
  }
  if (output.actual_prompt || output.orig_prompt) {
    normalized.revised_prompt = output.actual_prompt || output.orig_prompt;
  }
  if (Object.keys(usage).length) normalized.usage = usage;

  return normalized;
}

// -- adapter -----------------------------------------------------------------

export default {
  /**
   * DashScope splits creation and polling across different paths, so the
   * adapter supplies both rather than the core deriving one from the other.
   */
  createUrl: (model) => `${API_ROOT}${resolveProfile(model).path}`,

  pollUrl: (taskId) => `${API_ROOT}${TASK_PATH}/${encodeURIComponent(taskId)}`,

  /**
   * `X-DashScope-Async: enable` is mandatory on creation — without it DashScope
   * answers "current user api does not support synchronous calls". It must not
   * be sent when polling.
   */
  buildHeaders: (credentials, { create = false } = {}) => {
    const headers = { Accept: "application/json" };
    const key = credentials?.apiKey || credentials?.accessToken;
    if (key) headers.Authorization = `Bearer ${key}`;
    if (create) {
      headers["Content-Type"] = "application/json";
      headers["X-DashScope-Async"] = "enable";
    }
    return headers;
  },

  buildBody: (model, body) => buildCreateBody(model, body),

  normalizeCreate,
  normalizePoll,

  /**
   * DashScope has no synchronous video endpoint: creation only ever returns a
   * task id. Rather than make every caller implement a polling loop, the core
   * waits the job out and answers the create request with the finished video.
   * If the render outlives that wait, the create response still carries the
   * request_id and GET /v1/videos/{id} finishes the job, exactly as for xAI.
   */
  awaitCompletion: true,

  // Interval the docs recommend for GET /tasks/{id}.
  pollIntervalMs: 15000,
};
