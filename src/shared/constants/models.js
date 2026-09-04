// Import directly from file to avoid pulling in server-side dependencies via index.js
export {
  PROVIDER_MODELS,
  getProviderModels,
  getDefaultModel,
  isValidModel as isValidModelCore,
  findModelName,
  getModelTargetFormat,
  getModelStrip,
  PROVIDER_ID_TO_ALIAS,
  getModelsByProviderId,
  getModelUpstreamId,
  getModelQuotaFamily
} from "open-sse/config/providerModels.js";

import { AI_PROVIDERS, isOpenAICompatibleProvider } from "./providers.js";
import { PROVIDER_MODELS as MODELS } from "open-sse/config/providerModels.js";

// Providers that accept any model (passthrough)
const PASSTHROUGH_PROVIDERS = new Set(
  Object.entries(AI_PROVIDERS)
    .filter(([, p]) => p.passthroughModels)
    .map(([key]) => key)
);

// Wrap isValidModel with passthrough providers
export function isValidModel(aliasOrId, modelId) {
  if (isOpenAICompatibleProvider(aliasOrId)) return true;
  if (PASSTHROUGH_PROVIDERS.has(aliasOrId)) return true;
  const models = MODELS[aliasOrId];
  if (!models) return false;
  return models.some(m => m.id === modelId);
}

// Legacy AI_MODELS for backward compatibility
export const AI_MODELS = Object.entries(MODELS).flatMap(([alias, models]) =>
  models.map(m => ({ provider: alias, model: m.id, name: m.name }))
);

export const getModelKind = (m, fallback = null) => m?.kind || m?.type || fallback;

// Capacity metadata for UI badges — icon + label + color per capability.
// CapacityBadges renders exactly the keys listed here, in this order.
export const CAPACITY_META = {
  vision: { icon: "visibility", label: "Vision", desc: "Supports image input", color: "text-blue-500" },
  pdf: { icon: "picture_as_pdf", label: "Documents", desc: "Supports PDF / document input", color: "text-rose-500" },
  audioInput: { icon: "graphic_eq", label: "Audio in", desc: "Supports audio input", color: "text-violet-500" },
  videoInput: { icon: "movie", label: "Video in", desc: "Supports video input", color: "text-cyan-500" },
  tools: { icon: "handyman", label: "Tools", desc: "Supports tool / function calling", color: "text-emerald-500" },
  search: { icon: "travel_explore", label: "Web search", desc: "Supports web search", color: "text-sky-500" },
  reasoning: { icon: "neurology", label: "Reasoning", desc: "Supports reasoning / thinking", color: "text-amber-500" },
};

// Capabilities the dashboard can verify against the live provider, in the order
// an "all" sweep runs them (cheap text-only probes first). The probe module
// (src/app/api/models/test/probes.js) imports this list, so adding a probe here
// without a matching probe fn there is a 400, not a silent no-op.
export const PROBE_CAPABILITIES = ["tools", "vision", "pdf", "audioInput", "videoInput", "search"];

// The caps fields the dashboard consumes. One list so /api/models and
// useModelCaps cannot drift apart (they both project getCapabilitiesForModel).
export const UI_CAP_KEYS = [
  "vision", "pdf", "audioInput", "videoInput", "tools", "search", "reasoning",
  "contextWindow", "maxOutput",
];

// Project a full capabilities object down to what the UI needs.
export function pickUiCaps(c, extra) {
  const out = {};
  for (const k of UI_CAP_KEYS) out[k] = c?.[k];
  return extra ? { ...out, ...extra } : out;
}
