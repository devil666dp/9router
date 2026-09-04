// Template primitives for custom-endpoint recipes.
//
// A recipe is DATA, not code, and it needs exactly ONE outgoing operation:
//
//   {prompt} {system} {model} {temperature} {id} ...
//
// Every brace is looked up in the variable bag — the canonical request fields
// plus `model` and (while polling) `id`. There is no evaluation here, only
// substitution and property reads, because a recipe is user-supplied.
//
// Reading values back OUT of the provider's reply uses a path instead
// (`$.output`, `choices[0].message.content`) — see getPath.

/**
 * Replace every `{key}` in `str` with `vars[key]`.
 * An unknown key is left verbatim so a literal brace in a URL survives.
 */
export function interpolate(str, vars = {}) {
  if (typeof str !== "string") return str;
  return str.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (whole, key) => {
    const value = vars[key];
    if (value === undefined || value === null) return whole;
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  });
}

/** A string that is nothing but one placeholder, e.g. "{temperature}". */
const SOLE_PLACEHOLDER = /^\{([a-zA-Z0-9_.-]+)\}$/;

/**
 * Read a value out of `obj` by path.
 *
 * Accepts `$.a.b`, `a.b`, `$[0].text`, `a[0][1]` — the leading `$` is optional
 * and the two segment styles may be mixed. Returns undefined for any miss
 * rather than throwing: a recipe pointing at a field the provider did not send
 * is a normal outcome (optional usage counters, say), not an error.
 */
export function getPath(obj, path) {
  if (obj === null || obj === undefined || typeof path !== "string") return undefined;
  const cleaned = path.trim().replace(/^\$\.?/, "");
  if (!cleaned) return obj;

  let cursor = obj;
  for (const segment of splitPath(cleaned)) {
    if (cursor === null || cursor === undefined) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

/** `a.b[0].c` → ["a","b","0","c"] */
function splitPath(path) {
  const out = [];
  for (const part of path.split(".")) {
    if (!part) continue;
    const bracket = part.indexOf("[");
    if (bracket === -1) {
      out.push(part);
      continue;
    }
    if (bracket > 0) out.push(part.slice(0, bracket));
    for (const m of part.slice(bracket).matchAll(/\[([^\]]*)\]/g)) {
      out.push(m[1].replace(/^["']|["']$/g, ""));
    }
  }
  return out;
}

/** True when `value` is a legacy path reference (`$.foo`) rather than a literal. */
export function isPathRef(value) {
  return typeof value === "string" && value.startsWith("$.");
}

/**
 * Resolve a body template against the variable bag.
 *
 * Rules, applied recursively:
 *   "{temperature}"      → the value itself, TYPE PRESERVED (number, array,
 *                          object). The key is DROPPED when the variable is
 *                          absent, because most upstreams 422 on a stray null.
 *   "hi {model}, go"     → string interpolation
 *   "$.prompt"           → legacy path form, still honoured
 *   anything else        → passed through verbatim
 */
export function resolveTemplate(template, vars = {}) {
  if (Array.isArray(template)) {
    return template
      .map((item) => resolveTemplate(item, vars))
      .filter((item) => item !== undefined);
  }
  if (template && typeof template === "object") {
    const out = {};
    for (const [key, raw] of Object.entries(template)) {
      const value = resolveTemplate(raw, vars);
      if (value !== undefined) out[interpolate(key, vars)] = value;
    }
    return out;
  }
  if (typeof template === "string") {
    const sole = template.match(SOLE_PLACEHOLDER);
    // A value that is only a placeholder keeps its real type: temperature stays
    // a number, images stays an array, messages stays the whole array.
    if (sole) return vars[sole[1]];
    if (isPathRef(template)) return getPath(vars, template);
    return interpolate(template, vars);
  }
  return template;
}

/** Variable names a recipe may reference, for the form's help line. */
export const TEMPLATE_VARS = [
  "prompt", "system", "transcript", "messages", "images", "files",
  "model", "stream", "temperature", "top_p", "top_k", "max_tokens",
  "stop", "seed", "presence_penalty", "frequency_penalty", "reasoning_effort",
];
