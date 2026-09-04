// Executor for `custom-endpoint-*` provider nodes.
//
// A custom-endpoint node is an upstream that speaks NONE of the formats this
// engine knows — a bespoke body shape, and possibly a create-then-poll
// protocol instead of a single request. Rather than teach the translator about
// each one, the node carries a recipe (plain JSON) and this executor
// interprets it.
//
// The contract with chatCore is the one cursor.js and commandcode.js already
// use: do whatever is necessary internally, then return
// `responseFormat: FORMATS.OPENAI`. From that point the reply is
// indistinguishable from a real OpenAI provider's, so every translator,
// client format, usage counter and logger downstream works untouched.
//
// The engine hands us an OpenAI body (custom-endpoint ids are absent from the
// registry, so getTargetFormat falls back to "openai"), which is why recipes
// only ever reference one vocabulary.
import { BaseExecutor } from "./base.js";
import { FORMATS } from "../translator/formats.js";
import { buildCanonicalInput } from "../handlers/customEndpoint/input.js";
import { runRecipe, RecipeError } from "../handlers/customEndpoint/run.js";
import { jsonResponse, sseResponse, errorResponse } from "../handlers/customEndpoint/output.js";
import { normalizeSpec } from "../handlers/customEndpoint/spec.js";

export class CustomEndpointExecutor extends BaseExecutor {
  constructor(provider) {
    super(provider, {});
  }

  /** The recipe travels on the connection, like baseUrl does for compat nodes. */
  getSpec(credentials) {
    return credentials?.providerSpecificData?.spec || null;
  }

  // Reported for logging only — the real URLs come from the recipe, and a
  // two-step recipe has two. buildUrl exists because BaseExecutor declares it.
  buildUrl(model, stream, urlIndex = 0, credentials = null) {
    const spec = this.getSpec(credentials);
    return spec ? normalizeSpec(spec).url : "";
  }

  async execute({ model, body, stream, credentials, signal, log, proxyOptions = null }) {
    const rawSpec = this.getSpec(credentials);
    if (!rawSpec) {
      return {
        response: errorResponse(500, `Custom endpoint "${this.provider}" has no recipe configured — re-add the provider node.`),
        url: "",
        headers: {},
        transformedBody: null,
        responseFormat: FORMATS.OPENAI,
      };
    }

    const input = buildCanonicalInput(body, model);

    try {
      const { text, usage, url, requestBody } = await runRecipe({
        rawSpec,
        input,
        model,
        credentials,
        proxyOptions,
        signal,
        log,
      });

      // Upstream had no stream, so a streaming client gets the finished text
      // replayed as chunks. First-token latency equals full-completion latency;
      // that is a property of the upstream, not of this bridge.
      return {
        response: stream ? sseResponse(text, model, usage) : jsonResponse(text, model, usage),
        url,
        headers: {},
        transformedBody: requestBody,
        responseFormat: FORMATS.OPENAI,
      };
    } catch (error) {
      if (error instanceof RecipeError) {
        // Surfaced as a normal upstream failure so account fallback, model
        // locking and retry treat it exactly like any other provider error.
        return {
          response: errorResponse(error.status, `[${this.provider}] ${error.message}`),
          url: "",
          headers: {},
          transformedBody: null,
          responseFormat: FORMATS.OPENAI,
        };
      }
      throw error;
    }
  }
}

export default CustomEndpointExecutor;
