// Render a recipe's extracted reply as OpenAI output.
//
// The executor declares `responseFormat: "openai"`, so from here on the reply
// travels the same path as any real OpenAI provider — every translator, every
// client format, the usage tracker and the request logger all work unchanged.
// That is the whole reason this file exists: convert once, here, and let the
// rest of the engine stay ignorant of custom endpoints.

import { SSE_DONE, SSE_HEADERS } from "../../utils/sseConstants.js";
import { getPath } from "./template.js";

// Field names that plausibly hold the reply, best guess first. Tried in order
// when the recipe names no textPath, so a single-field API needs zero config.
const WRAPPER_KEYS = ["text", "content", "output", "message", "response", "value",
  "delta", "chunk", "answer", "result", "completion", "reply", "data", "choices"];

/**
 * Coerce whatever a recipe's textPath landed on into a string.
 *
 * The wrapper walk keeps LOOKING when a candidate turns out empty instead of
 * committing to the first key that merely exists. Providers modelled on the
 * OpenAI Responses API send the whole envelope with unused fields present and
 * null — Parallel replies `{text: null, output: [...]}` — so stopping at `text`
 * would report an empty reply while the answer sat one key away.
 *
 * @param {*} value
 * @param {boolean} allowJson dump the object as JSON when nothing reads as text.
 *   False while probing a wrapper, so a stringified sub-object can never beat a
 *   real string found under a later key.
 */
export function coerceText(value, allowJson = true) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => coerceText(item, allowJson)).filter(Boolean).join("");
  }
  if (typeof value === "object") {
    for (const key of WRAPPER_KEYS) {
      const inner = value[key];
      if (inner === undefined || inner === null) continue;
      const text = coerceText(inner, false);
      if (text) return text;
    }
    // An object with nothing in it is not a reply — let the caller report
    // "could not find the text" instead of handing the user a literal "{}".
    if (!Object.keys(value).length) return "";
    return allowJson ? JSON.stringify(value) : "";
  }
  return String(value);
}

/** Top-level field names of a reply, for the "we could not find the text" error. */
export function describeFields(payload) {
  if (!payload || typeof payload !== "object") return "";
  const keys = Array.isArray(payload) ? [`${payload.length} items`] : Object.keys(payload);
  return keys.slice(0, 12).join(", ");
}

// Token-count field names, per slot. Providers agree on the concept and
// disagree on the spelling, so the whole spread is listed rather than asking
// the user to map it: OpenAI (prompt_tokens), Responses/Anthropic-style
// (input_tokens), Gemini (promptTokenCount), and camelCase variants.
const USAGE_KEYS = {
  prompt: ["prompt_tokens", "input_tokens", "promptTokens", "inputTokens",
    "promptTokenCount", "prompt_token_count", "input_token_count"],
  completion: ["completion_tokens", "output_tokens", "completionTokens", "outputTokens",
    "candidatesTokenCount", "completion_token_count", "output_token_count"],
  total: ["total_tokens", "totalTokens", "totalTokenCount", "total_token_count"],
};

/** Objects that plausibly hold the token counts, in the order worth trying. */
function usageCandidates(payload) {
  if (!payload || typeof payload !== "object") return [];
  return [payload.usage, payload.usageMetadata, payload.token_usage, payload.tokens,
    payload.meta?.usage, payload.metadata?.usage, payload].filter(
    (candidate) => candidate && typeof candidate === "object");
}

function readSlot(source, names) {
  for (const name of names) {
    const value = Number(source[name]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

/**
 * Pull usage out of an upstream payload.
 *
 * A recipe MAY name the paths; when it does not, the well-known field names are
 * tried instead — the same "9router works it out" contract as the reply text and
 * the job id. Returning null (rather than zeros) matters: it tells the caller no
 * real counts were reported, so the gateway falls back to its own estimate
 * instead of recording a confident zero.
 */
export function extractUsage(payload, usageSpec) {
  if (usageSpec) {
    const prompt = Number(getPath(payload, usageSpec.promptPath || "")) || 0;
    const completion = Number(getPath(payload, usageSpec.completionPath || "")) || 0;
    const total = Number(getPath(payload, usageSpec.totalPath || "")) || prompt + completion;
    if (prompt || completion || total) {
      return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: total };
    }
  }

  for (const source of usageCandidates(payload)) {
    const prompt = readSlot(source, USAGE_KEYS.prompt);
    const completion = readSlot(source, USAGE_KEYS.completion);
    const total = readSlot(source, USAGE_KEYS.total) || prompt + completion;
    // A bare total with no breakdown still counts — some APIs send only that —
    // but every slot empty means this was not a usage object at all.
    if (prompt || completion || total) {
      return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: total };
    }
  }
  return null;
}

function completionId() {
  return `chatcmpl-${Math.random().toString(36).slice(2, 12)}`;
}

/** A complete OpenAI chat.completion body. */
export function buildCompletion(text, model, usage = null) {
  return {
    id: completionId(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: { role: "assistant", content: text },
      finish_reason: "stop",
    }],
    usage: usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

/** JSON Response carrying that body. */
export function jsonResponse(text, model, usage = null) {
  return new Response(JSON.stringify(buildCompletion(text, model, usage)), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// Chunk size for synthesized streaming. The text is already complete before the
// first byte goes out, so this only controls how the client renders it — small
// enough to look like typing, large enough not to flood the transform stream.
const CHUNK_CHARS = 24;

/**
 * SSE Response that replays a finished string as OpenAI chunks.
 *
 * This is honest about what it is: the upstream had no stream, so first-token
 * latency equals full-completion latency. What it buys is that a streaming
 * client (and every downstream translator) sees the shape it expects.
 */
export function sseResponse(text, model, usage = null) {
  const encoder = new TextEncoder();
  const id = completionId();
  const created = Math.floor(Date.now() / 1000);
  const frame = (delta, finish = null) => `data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  })}\n\n`;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(frame({ role: "assistant", content: "" })));
      const body = String(text ?? "");
      for (let i = 0; i < body.length; i += CHUNK_CHARS) {
        controller.enqueue(encoder.encode(frame({ content: body.slice(i, i + CHUNK_CHARS) })));
      }
      controller.enqueue(encoder.encode(frame({}, "stop")));
      if (usage) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          id, object: "chat.completion.chunk", created, model, choices: [], usage,
        })}\n\n`));
      }
      controller.enqueue(encoder.encode(SSE_DONE));
      controller.close();
    },
  });

  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}

/** Error in the shape chatCore's error path already understands. */
export function errorResponse(status, message) {
  return new Response(JSON.stringify({ error: { message, type: "api_error", code: status } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
