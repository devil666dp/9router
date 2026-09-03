/**
 * Reading OpenAI-shaped chat responses off the wire.
 *
 * The gateway answers /v1/chat/completions on `text/event-stream` even when the
 * request asked for `stream:false`, and can append `data: [DONE]` directly onto
 * the JSON body with no separator. So a caller cannot pick a parse strategy from
 * the content-type — it has to read the body as a sequence of frames either way.
 * These helpers do that, plus the field-name shuffling different upstreams apply
 * to content and reasoning.
 */

// Content can arrive as a plain string or as OpenAI content blocks.
export function textOf(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((part) => (typeof part === "string" ? part : part?.text || "")).join("");
  return "";
}

// Reasoning travels under three different keys depending on the upstream
// (see open-sse/translator/concerns/reasoning.js) — accept all of them.
export function reasoningOf(source) {
  if (!source || typeof source !== "object") return "";
  if (typeof source.reasoning_content === "string") return source.reasoning_content;
  if (typeof source.reasoning === "string") return source.reasoning;
  if (Array.isArray(source.reasoning_details)) {
    return source.reasoning_details.map((d) => (typeof d === "string" ? d : d?.text || d?.content || "")).join("");
  }
  return "";
}

/** One frame → the fields a caller accumulates. `delta` (stream) and `message` (whole) are the same shape. */
export function readChunk(chunk) {
  const choice = chunk?.choices?.[0] || {};
  const delta = choice.delta || choice.message || {};
  return {
    text: textOf(delta.content) || textOf(chunk?.output_text),
    reasoning: reasoningOf(delta),
    finishReason: choice.finish_reason || null,
    usage: chunk?.usage || null,
    model: typeof chunk?.model === "string" ? chunk.model : "",
  };
}

/**
 * One line of the response body → one JSON frame, or null when the line carries
 * no payload. Handles an SSE `data:` prefix, a bare JSON object, and a `[DONE]`
 * terminator glued to the end of an object.
 */
export function frameOf(line) {
  let rest = String(line || "").trim();
  if (!rest) return null;
  rest = rest.replace(/\}\s*data:\s*\[DONE\]\s*$/, "}");
  if (rest.startsWith("data:")) rest = rest.slice(5).trim();
  if (!rest.startsWith("{")) return null;
  try { return JSON.parse(rest); } catch { return null; }
}

/** Strip any trailing SSE terminator so a non-SSE body can be JSON.parse'd whole. */
export function stripDoneTerminator(raw) {
  return String(raw || "").replace(/(?:\r?\n|^)*data:\s*\[DONE\]\s*$/g, "").trim();
}
