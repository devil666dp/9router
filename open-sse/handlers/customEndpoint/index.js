// Custom-endpoint recipes: a provider defined as DATA rather than as code.
//
// Everything a recipe can express lives in these six files:
//   template.js  {placeholder} substitution + path lookup — the whole language
//   spec.js      recipe shape, normalization, validation
//   input.js     OpenAI body → the canonical fields a recipe references
//   run.js       call (→ poll) driver
//   output.js    extracted text → OpenAI completion / synthesized SSE
//   fromCurl.js  derive a recipe from a pasted curl command (import-time only)
//
// The executor that ties them together is open-sse/executors/customEndpoint.js.
export { interpolate, getPath, resolveTemplate, isPathRef, TEMPLATE_VARS } from "./template.js";
export { normalizeSpec, validateSpec, specUrls, collectPlaceholders, PROTOCOLS, DEFAULTS } from "./spec.js";
export { buildCanonicalInput } from "./input.js";
export { runRecipe, buildHeaders, RecipeError } from "./run.js";
export { coerceText, describeFields, extractUsage, buildCompletion, jsonResponse, sseResponse, errorResponse } from "./output.js";
export { specFromCurl, guessTextPath } from "./fromCurl.js";
