// Replicate — the config-driven part, shared by the image and video adapters.
//
// Replicate runs ~everything behind ONE protocol (see ./api.js): a prediction is
// created, then polled until it succeeds. The only thing that differs between
// the hundreds of models it hosts is the INPUT SCHEMA, so neither adapter
// carries per-model code. Each kind ships a table of
//
//   "owner/name": ["Display Name", "<spec>"]
//
// and everything else derives from it: which body fields are forwarded, which
// enum value a loose input snaps to, which media a model requires, the local 400
// wording when it is missing, and the registry `params` that gate the
// dashboard's inputs. Adding a model, or a field on one, is one line.
//
// Spec syntax, per field, comma separated:
//   name              string
//   *name             required
//   name:b|i|n|a|o    boolean / integer / number / array / object (default string)
//   name[a,b,c]       enum of accepted values
//
// The client-facing contract stays the ONE image body and the ONE video body
// 9router publishes everywhere. Generic names (`image`, `n`, `size`, `ratio`,
// `last_frame`, `video`, `reference_images`, `audio`, …) are resolved to whatever
// THIS model happens to call them (FIELD_SOURCES), loose values are snapped into
// its enums, and anything it does not accept is dropped rather than forwarded —
// Replicate 422s on unknown input keys.

const TYPE_CODES = { b: "boolean", i: "integer", n: "number", a: "array", o: "object" };

/** Split a spec string on commas that are not inside an enum bracket. */
function specTokens(spec) {
  const tokens = [];
  let depth = 0;
  let token = "";
  for (const ch of spec) {
    if (ch === "[") depth++;
    else if (ch === "]") depth--;
    if (ch === "," && depth === 0) {
      tokens.push(token);
      token = "";
      continue;
    }
    token += ch;
  }
  if (token) tokens.push(token);
  return tokens;
}

/** One spec string -> `{ fields: Map<name, field>, required: string[] }`. */
export function parseSpec(spec) {
  const fields = new Map();
  const required = [];
  for (const raw of specTokens(spec)) {
    const entry = raw.trim();
    if (!entry) continue;
    const isRequired = entry.startsWith("*");
    let rest = isRequired ? entry.slice(1) : entry;
    let values = null;
    const open = rest.indexOf("[");
    if (open !== -1 && rest.endsWith("]")) {
      values = rest.slice(open + 1, -1).split(",").map((v) => v.trim()).filter(Boolean);
      rest = rest.slice(0, open);
    }
    const [name, code] = rest.split(":");
    if (!name) continue;
    fields.set(name, { name, type: TYPE_CODES[code] || "string", values, required: isRequired });
    if (isRequired) required.push(name);
  }
  return { fields, required };
}

// ── value coercion ──────────────────────────────────────────────────────────
// Replicate validates input types strictly (422 on a string where a boolean
// belongs) and rejects any value outside a field's enum. Dashboard selects and
// shell callers both produce strings, and one 9router body is sent to models
// whose enums disagree (`duration` 4|6|8 vs 5|10, `aspect_ratio` with or without
// "match_input_image"), so every value is cast to the field's declared type and
// snapped into its enum when it has one.

function castType(type, value) {
  if (type === "boolean") {
    if (typeof value === "boolean") return value;
    const s = String(value).toLowerCase();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
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
    if (Array.isArray(value)) {
      const items = value.filter((v) => v !== undefined && v !== null && v !== "");
      return items.length ? items : undefined;
    }
    if (value && typeof value === "object") return [value];
    const parts = String(value).split(",").map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts : undefined;
  }
  if (type === "object") {
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
  // A caller may send a list where THIS model takes one ("image": [a, b] to a
  // single-image model). The first item is what they meant; String(array) would
  // forward "a,b" as though it were one URL.
  if (Array.isArray(value)) {
    const first = value.find((v) => v !== undefined && v !== null && v !== "");
    return first === undefined ? undefined : castType("string", first);
  }
  return typeof value === "string" ? value : String(value);
}

/**
 * Snap a caller value onto one of the field's accepted values.
 *
 * Exact, then case-insensitive, then geometry-aware, then numeric-nearest. The
 * last one is what lets one `duration: 8` satisfy Veo's `[4,6,8]`, Kling's
 * `[5,10]` and Hailuo's `[6,10]`; the geometry pass ahead of it is what stops a
 * `size: "1024x1024"` from being read as the number 1024 and landing on `4 MP`
 * (see snapGeometry). A value none of them can place (`output_format: "avif"`
 * where the model offers webp/jpg/png) is dropped rather than forwarded, since
 * Replicate would reject the whole prediction for it.
 */
/**
 * The number an enum option is "worth", for the nearest-value pass.
 *
 * Upscalers write the same factor as `4`, `4x` and `x4`, so a leading parseFloat
 * is not enough — the digits may sit anywhere in the option. Falling back to the
 * first number in the string is what lets one `upscale_factor: 4` reach all
 * three spellings.
 */
function numberIn(text) {
  const head = parseFloat(text);
  if (Number.isFinite(head)) return head;
  const match = String(text).match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
}

function snapEnum(field, value) {
  const wanted = String(value).trim();
  for (const option of field.values) {
    if (String(option) === wanted) return castType(field.type, option);
  }
  const lower = wanted.toLowerCase();
  for (const option of field.values) {
    if (String(option).toLowerCase() === lower) return castType(field.type, option);
  }
  const geometric = snapGeometry(field, wanted);
  if (geometric !== undefined) return castType(field.type, geometric);
  const target = numberIn(wanted);
  if (Number.isFinite(target)) {
    let best;
    let bestDelta = Infinity;
    for (const option of field.values) {
      const n = numberIn(String(option));
      if (!Number.isFinite(n)) continue;
      const delta = Math.abs(n - target);
      if (delta < bestDelta) {
        best = option;
        bestDelta = delta;
      }
    }
    if (best !== undefined) return castType(field.type, best);
  }
  return undefined;
}

export function coerceField(field, value) {
  if (field.values && field.type !== "array" && field.type !== "object") return snapEnum(field, value);
  return castType(field.type, value);
}

// ── geometry ────────────────────────────────────────────────────────────────
// A caller may send `size` ("1280x720") where the model wants a resolution tier
// plus an aspect ratio, or vice versa, so a pixel size is translated instead of
// dropped. Pixel counts, not names, decide the tier.

const RATIOS = [
  ["21:9", 21 / 9], ["16:9", 16 / 9], ["3:2", 3 / 2], ["5:4", 5 / 4], ["4:3", 4 / 3],
  ["1:1", 1], ["3:4", 3 / 4], ["4:5", 4 / 5], ["2:3", 2 / 3], ["9:16", 9 / 16], ["9:21", 9 / 21],
];

const TIER_PIXELS = [
  ["480p", 854 * 480],
  ["540p", 960 * 540],
  ["720p", 1280 * 720],
  ["768p", 1366 * 768],
  ["1080p", 1920 * 1080],
  ["1440p", 2560 * 1440],
  ["2160p", 3840 * 2160],
  ["4k", 3840 * 2160],
];

export function parseSize(value) {
  const match = String(value || "").match(/(\d{2,5})\s*[x*×]\s*(\d{2,5})/i);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

// A named resolution says ONE side in pixels, and which side it names depends on
// the name: "720p" is the SHORT side (720x1280 and 1280x720 are both 720p) while
// "2K" and "FHD" name the LONG one. Both are therefore resolved against a SHAPE
// (long/short, >= 1) rather than a flat pixel table like TIER_PIXELS, and both
// against the SAME shape — mixing a widescreen assumption into one branch and a
// square one into the other is what would read `2160p` as nearer `2k` than `4k`.
const SHORT_SIDE_TIER = /^(\d{3,4})p$/i;
const LONG_SIDE_TIER = /^(\d+(?:\.\d+)?)\s*k$/i;
const LONG_SIDE_NAMES = { hd: 1280, fhd: 1920, qhd: 2560, uhd: 3840 };
const MEGAPIXELS = /^(\d+(?:\.\d+)?)\s*(?:mp|megapixels?)$/i;
// `megapixels[1,0.25]` writes its options as bare numbers, so only a field whose
// NAME says megapixels may read one that way — `duration[5,10]` must not.
const MEGAPIXEL_FIELD = /megapixel/i;
const DEFAULT_SHAPE = 16 / 9;
// Tie-break weight only; see snapGeometry.
const TIER_AMBIGUITY = 0.02;

/**
 * A size expression as `{ pixels, ratio }`, or null when it is not one.
 *
 * Everything a model might call a size lands here — "1280x720", "1024 x 1024
 * (Square)", "2 MP", "720p", "4K", "FHD", and the bare "0.25" a megapixels field
 * uses — so that two sizes written in different units can be compared at all.
 * `ratio` is w/h and is only known for an explicit pair, because a portrait
 * request must not be answered with the landscape option of the same pixel count;
 * a named tier constrains size but not shape and reports null.
 *
 * @param {number} shape long/short of the size being matched against (>= 1), 0 when unknown
 */
function geometryOf(field, text, shape = 0) {
  const raw = String(text).trim();
  const dim = parseSize(raw);
  if (dim && dim.width > 0 && dim.height > 0) {
    return { pixels: dim.width * dim.height, ratio: dim.width / dim.height };
  }
  const mp = raw.match(MEGAPIXELS);
  if (mp) return { pixels: Number(mp[1]) * 1e6, ratio: null };
  // Named tiers are video vocabulary, so widescreen unless the caller's own size
  // says otherwise.
  const oblong = shape > 0 ? shape : DEFAULT_SHAPE;
  const short = raw.match(SHORT_SIDE_TIER);
  if (short) {
    const side = Number(short[1]);
    return { pixels: side * side * oblong, ratio: null };
  }
  const long = LONG_SIDE_NAMES[raw.toLowerCase()] || (raw.match(LONG_SIDE_TIER) ? Number(raw.match(LONG_SIDE_TIER)[1]) * 1024 : 0);
  if (long > 0) return { pixels: (long * long) / oblong, ratio: null };
  if (MEGAPIXEL_FIELD.test(field.name)) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return { pixels: n * 1e6, ratio: null };
  }
  return null;
}

/**
 * Snap a size onto a field's enum when both sides are talking about geometry.
 *
 * The enums that describe a size do it in whichever unit the model's author
 * preferred — "1024x1024", "1 MP", "1K", "720p", "1024 x 1024 (Square)" — and a
 * caller sends ONE `size`. Comparing them as pixels, with a penalty for changing
 * the shape, is what lets `size: "1024x1024"` reach `1 MP`; the numeric-nearest
 * pass behind this one would read that as the number 1024 and answer `4 MP`.
 *
 * Returns undefined unless BOTH the value and at least one option are geometry,
 * which is what leaves `duration`, `fps` and `seed` enums to that pass untouched.
 */
function snapGeometry(field, value) {
  const target = geometryOf(field, value);
  if (!target || !(target.pixels > 0)) return undefined;
  const shape = target.ratio ? Math.max(target.ratio, 1 / target.ratio) : 0;
  let best;
  let bestScore = Infinity;
  for (const option of field.values) {
    const geometry = geometryOf(field, option, shape);
    if (!geometry || !(geometry.pixels > 0)) continue;
    let score = Math.abs(Math.log(geometry.pixels / target.pixels));
    // Shape counts double: a 16:9 request answered with a square is worse than
    // the same shape one resolution step away.
    if (geometry.ratio && target.ratio) score += 2 * Math.abs(Math.log(geometry.ratio / target.ratio));
    // Some models list tiers AND exact pairs in the same enum (wan's `size` has
    // "2K" and "2048*1152"), and both score 0 against a caller's "2048x1152". The
    // pair is the better answer of the two because it pins the shape as well as
    // the area, where the tier leaves the shape to the model. This only breaks
    // ties — it is far below the ~0.69 that separates adjacent tiers, so it never
    // outvotes a real difference in pixel count.
    if (target.ratio && !geometry.ratio) score += TIER_AMBIGUITY;
    if (score < bestScore) {
      best = option;
      bestScore = score;
    }
  }
  return best;
}

/** Closest named tier to a pixel size. */
export function tierForSize(dim) {
  const pixels = dim.width * dim.height;
  let best = TIER_PIXELS[0][0];
  let bestDelta = Infinity;
  for (const [tier, area] of TIER_PIXELS) {
    const delta = Math.abs(area - pixels);
    if (delta < bestDelta) {
      best = tier;
      bestDelta = delta;
    }
  }
  return best;
}

/** Closest named aspect ratio to a pixel size. */
export function ratioForSize(dim) {
  const actual = dim.width / dim.height;
  let best = "1:1";
  let bestDelta = Infinity;
  for (const [name, value] of RATIOS) {
    const delta = Math.abs(Math.log(value) - Math.log(actual));
    if (delta < bestDelta) {
      best = name;
      bestDelta = delta;
    }
  }
  return best;
}

/**
 * The id to send upstream for a resolved model.
 *
 * A caller may name a model loosely ("veo-3.1") or pin an exact build
 * ("google/veo-3.1:abc123"); the schema always comes from the resolved spec, but
 * the REQUEST must carry the pin when there is one, since that is the build they
 * asked to be billed for. Everything else travels as the canonical `owner/name`.
 */
export function pinnedId(model, spec) {
  const raw = String(model || "").trim();
  const colon = raw.indexOf(":");
  if (colon === -1) return spec?.id || raw;
  return `${spec?.id || raw.slice(0, colon)}:${raw.slice(colon + 1).trim()}`;
}

// ── catalogue ───────────────────────────────────────────────────────────────

/**
 * Build the resolver + request builder + introspection for one kind's model
 * table. Images and video share every mechanic and differ only in their tables
 * and in which generic names cross-map, so both call this with their own data.
 *
 * @param {object} options
 * @param {Record<string,[string,string]>} options.specs `"owner/name": [displayName, spec]`
 * @param {Record<string,string[]>} options.fieldSources model field -> body keys that fill it, in priority order
 * @param {Record<string,string>} options.hints model field -> human wording for the missing-field 400
 * @param {Record<string,string>} options.publicNames model field -> the generic name the dashboard shows
 * @param {Record<string,*>} [options.defaults] values for required fields a prompt-only caller cannot know
 * @param {Set<string>} options.nonInputKeys body keys that are 9router metadata, never model input
 * @param {string} options.label prefix for thrown errors ("replicate image")
 * @param {(body:object)=>object} [options.derived] extra body keys derived from `size` etc.
 * @param {(spec:object)=>string[]} [options.extraFields] additional published param names per model
 */
export function createCatalog({
  specs,
  fieldSources = {},
  hints = {},
  publicNames = {},
  defaults = {},
  nonInputKeys = new Set(),
  label = "replicate",
  derived = () => ({}),
  extraFields = () => [],
}) {
  const cache = new Map();

  /**
   * Replicate model ids are always `owner/name`, and callers reach them through
   * `replicate/<owner>/<name>`, so the provider prefix may or may not have been
   * stripped by the time the model gets here. Both spellings resolve, and a bare
   * `name` resolves when exactly one owner publishes it — which is how these ids
   * read in conversation ("veo-3.1", "flux-schnell").
   */
  const byBareName = new Map();
  for (const id of Object.keys(specs)) {
    const bare = id.slice(id.indexOf("/") + 1);
    if (byBareName.has(bare)) byBareName.set(bare, null); // ambiguous — require the owner
    else byBareName.set(bare, id);
  }

  function normalizeModelId(model) {
    const raw = String(model || "").trim().replace(/^\/+|\/+$/g, "");
    if (!raw) return "";
    // A version-pinned id ("owner/name:hash") keeps its hash for the request but
    // resolves its schema from the unpinned id.
    const id = raw.split(":")[0];
    if (specs[id]) return id;
    const stripped = id.replace(/^replicate\//, "");
    if (specs[stripped]) return stripped;
    const bare = byBareName.get(stripped);
    return bare || id;
  }

  /** Field table for a model id, or null when the model is unknown. */
  function resolveSpec(model) {
    const id = normalizeModelId(model);
    if (!id) return null;
    if (cache.has(id)) return cache.get(id);
    const entry = specs[id];
    const parsed = entry ? { id, name: entry[0], ...parseSpec(entry[1]) } : null;
    cache.set(id, parsed);
    return parsed;
  }

  /**
   * Build the Replicate `input` object for any model.
   *
   * Every accepted field is filled from the first body key that supplies it,
   * cast to its declared type, and snapped into its enum; nothing else is
   * forwarded. That is the whole "one body, all models" contract — `guidance`
   * sent to a Veo model is dropped, sent to a FLUX model it is honored, and
   * neither request needed code here to say so.
   */
  function buildInput(model, body) {
    const spec = resolveSpec(model);
    if (!spec) throw new Error(`${label}: unknown model '${model}'`);

    const extra = derived(body, spec);
    const read = (key) => {
      const value = body?.[key] !== undefined ? body[key] : extra[key];
      return value === undefined || value === null || value === "" ? undefined : value;
    };

    const input = {};
    for (const field of spec.fields.values()) {
      const sources = fieldSources[field.name] || [field.name];
      let coerced;
      for (const source of sources) {
        if (nonInputKeys.has(source)) continue;
        const value = read(source);
        if (value === undefined) continue;
        coerced = coerceField(field, value);
        if (coerced !== undefined) break;
      }
      if (coerced === undefined && field.required && defaults[field.name] !== undefined) {
        coerced = coerceField(field, defaults[field.name]);
      }
      if (coerced !== undefined) input[field.name] = coerced;
    }

    const missing = spec.required.filter((name) => input[name] === undefined);
    if (missing.length) {
      const wording = missing.map((name) => hints[name] || `'${name}'`).join(", ");
      throw new Error(`${label}: ${spec.id} requires ${wording}`);
    }
    return input;
  }

  /**
   * Every request field this model accepts, in one flat list.
   *
   * The provider registry stores this per model so the dashboard can gate its
   * inputs, and generating it from the same table the request builder reads is
   * what keeps the two from drifting apart. Fields are published under their
   * generic 9router names where one exists, because those are the names the
   * shared request documents.
   */
  function modelFields(model) {
    const spec = resolveSpec(model);
    if (!spec) return ["prompt"];
    const fields = [];
    const add = (key) => {
      if (key && !fields.includes(key)) fields.push(key);
    };
    if (spec.fields.has("prompt")) add("prompt");
    for (const field of spec.fields.values()) {
      if (field.name === "prompt") continue;
      add(publicNames[field.name] || field.name);
    }
    for (const key of extraFields(spec)) add(key);
    return fields;
  }

  /** `{ id, name, fields, capabilities }` for every model, for registry generation. */
  function catalogue() {
    return Object.keys(specs).map((id) => ({
      id,
      name: specs[id][0],
      fields: modelFields(id),
      spec: resolveSpec(id),
    }));
  }

  return { specs, normalizeModelId, resolveSpec, buildInput, modelFields, catalogue };
}
