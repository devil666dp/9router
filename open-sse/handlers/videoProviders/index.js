// Video provider adapter registry.
//
// A video adapter is OPTIONAL. Providers without one (xAI Grok Imagine) keep the
// byte-for-byte proxy in videoCore.js: the client's body goes upstream untouched
// and the upstream JSON comes back verbatim. An adapter is only needed when the
// upstream API is not already shaped like /v1/videos — it then supplies the
// create/poll URLs, headers and body, and normalizes both responses into the
// same `{request_id}` / `{status, video:{url}}` contract clients already poll.
import qwen from "./qwen.js";
import falAi from "./falAi.js";
import replicate from "./replicate.js";

const ADAPTERS = {
  qwen,
  "fal-ai": falAi,
  replicate,
};

export function getVideoAdapter(provider) {
  return ADAPTERS[provider] || null;
}

export function isVideoAdapterProvider(provider) {
  return provider in ADAPTERS;
}
