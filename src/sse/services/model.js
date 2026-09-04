// Re-export from open-sse with localDb integration
import { getModelAliases, getComboByName, getProviderNodes, getProviderNodeById } from "@/lib/localDb";
import { parseModel as parseModelCore, resolveModelAliasFromMap, getModelInfoCore } from "open-sse/services/model.js";
import REGISTRY from "open-sse/providers/registry/index.js";

// Local provider alias overrides (HMR-friendly, applied on top of open-sse map)
const LOCAL_PROVIDER_ALIASES = {
  xmtp: "xiaomi-tokenplan",
  "xiaomi-tokenplan": "xiaomi-tokenplan",
};

const RESERVED_PROVIDER_PREFIXES = new Set(Object.keys(LOCAL_PROVIDER_ALIASES));
for (const entry of REGISTRY) {
  RESERVED_PROVIDER_PREFIXES.add(entry.id);
  if (entry.alias) RESERVED_PROVIDER_PREFIXES.add(entry.alias);
  for (const alias of entry.aliases || []) RESERVED_PROVIDER_PREFIXES.add(alias);
}

export function parseModel(modelStr) {
  const parsed = parseModelCore(modelStr);
  if (parsed?.providerAlias && LOCAL_PROVIDER_ALIASES[parsed.providerAlias]) {
    return { ...parsed, provider: LOCAL_PROVIDER_ALIASES[parsed.providerAlias] };
  }
  return parsed;
}

/**
 * Resolve model alias from localDb
 */
export async function resolveModelAlias(alias) {
  const aliases = await getModelAliases();
  return resolveModelAliasFromMap(alias, aliases);
}

/**
 * Get full model info (parse or resolve)
 */
export async function getModelInfo(modelStr) {
  const parsed = parseModel(modelStr);

  if (!parsed.isAlias) {
    // Provider-node prefixes are user-defined. They must not override built-in
    // provider ids/aliases such as `cf`, `cloudflare-ai`, `openai`, or `hf`.
    if (!RESERVED_PROVIDER_PREFIXES.has(parsed.providerAlias)) {
      const openaiNodes = await getProviderNodes({ type: "openai-compatible" });
      const matchedOpenAI = openaiNodes.find((node) => node.prefix === parsed.providerAlias);
      if (matchedOpenAI) {
        return { provider: matchedOpenAI.id, model: parsed.model };
      }

      const anthropicNodes = await getProviderNodes({ type: "anthropic-compatible" });
      const matchedAnthropic = anthropicNodes.find((node) => node.prefix === parsed.providerAlias);
      if (matchedAnthropic) {
        return { provider: matchedAnthropic.id, model: parsed.model };
      }

      const embeddingNodes = await getProviderNodes({ type: "custom-embedding" });
      const matchedEmbedding = embeddingNodes.find((node) => node.prefix === parsed.providerAlias);
      if (matchedEmbedding) {
        return { provider: matchedEmbedding.id, model: parsed.model };
      }

      // Checked last so an existing prefix always keeps winning.
      const customEndpointNodes = await getProviderNodes({ type: "custom-endpoint" });
      const matchedCustomEndpoint = customEndpointNodes.find((node) => node.prefix === parsed.providerAlias);
      if (matchedCustomEndpoint) {
        return { provider: matchedCustomEndpoint.id, model: parsed.model };
      }
    }
    return {
      provider: parsed.provider,
      model: parsed.model
    };
  }

  // Check if this is a combo name before resolving as alias
  // This prevents combo names from being incorrectly routed to providers
  const combo = await getComboByName(parsed.model);
  if (combo) {
    // Return null provider to signal this should be handled as combo
    // The caller (handleChat) will detect this and handle it as combo
    return { provider: null, model: parsed.model };
  }

  return getModelInfoCore(modelStr, getModelAliases);
}

/**
 * Check if model is a combo and get models list
 * @returns {Promise<string[]|null>} Array of models or null if not a combo
 */
export async function getComboModels(modelStr) {
  // Only check if it's not in provider/model format
  if (modelStr.includes("/")) return null;

  const combo = await getComboByName(modelStr);
  if (combo && combo.models && combo.models.length > 0) {
    return combo.models;
  }
  return null;
}

/**
 * Human-readable provider name for log lines and the console viewer.
 *
 * Custom provider nodes are stored under a generated id ("openai-compatible-chat-<uuid>").
 * Routing needs that id, but printing it makes every log line unreadable. Resolve it to
 * the prefix the user actually types (falling back to the node's display name). Built-in
 * providers already read well and never hit the DB.
 *
 * Cached briefly: this runs on every request, and a node's prefix changes only when the
 * user edits it — a few seconds of staleness in a log label costs nothing.
 *
 * Never throws — a label is cosmetic and must not be able to fail a request.
 */
const LABEL_CACHE_TTL_MS = 30000;
const labelCache = new Map();

export async function resolveProviderLabel(providerId) {
  if (typeof providerId !== "string" || !providerId) return providerId;
  // Built-in providers own their ids and aliases; only user-created nodes need a lookup.
  if (RESERVED_PROVIDER_PREFIXES.has(providerId)) return providerId;

  const cached = labelCache.get(providerId);
  if (cached && (Date.now() - cached.at) < LABEL_CACHE_TTL_MS) return cached.label;

  let label = providerId;
  try {
    const node = await getProviderNodeById(providerId);
    label = node?.prefix?.trim() || node?.name?.trim() || providerId;
  } catch {
    // DB unavailable — fall back to the id rather than failing the request.
    return providerId;
  }
  labelCache.set(providerId, { label, at: Date.now() });
  return label;
}
