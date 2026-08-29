/**
 * Shared combo runner for media surfaces (embedding, image, tts, stt, video).
 *
 * The LLM path in `src/sse/handlers/chat.js` resolves its own strategy because it also
 * supports fusion (panel + judge) and the capacity adapter. Media kinds support only
 * Fallback and Round Robin: there is no meaningful way to synthesize two audio files,
 * two images, or two embedding vectors into one answer, so `allowFusion` is false here
 * and a stored "fusion" entry degrades to "fallback".
 *
 * Everything else is delegated to `handleComboChat`, which is already modality-agnostic
 * (it only touches `.ok`, `.status`, and `.clone().json()` on the per-attempt Response).
 */

import { handleComboChat, resolveComboStrategy } from "open-sse/services/combo.js";

/**
 * Run a media combo across its models with fallback/round-robin.
 *
 * @param {Object} options
 * @param {string} options.comboName - Combo name as the client sent it
 * @param {string[]} options.models - Combo member models ("provider/model" or bare provider id)
 * @param {Object} options.settings - Settings object (comboStrategies, comboStrategy, comboStickyRoundRobinLimit)
 * @param {Function} options.handleSingleModel - (body, modelStr) => Promise<Response>
 * @param {Object} options.log - Logger
 * @param {string} options.tag - Log tag ("EMBEDDINGS" | "IMAGE" | "TTS" | "STT" | "VIDEO")
 * @param {Object} [options.body] - Request body forwarded to each attempt (may be a non-JSON carrier)
 * @param {Function} [options.shouldFallbackFn] - Override the retry predicate (see handleComboChat)
 * @returns {Promise<Response>}
 */
export function runMediaCombo({ comboName, models, settings, handleSingleModel, log, tag, body, shouldFallbackFn }) {
  const { strategy, stickyLimit } = resolveComboStrategy(comboName, settings, { allowFusion: false });

  log.info(tag, `Combo "${comboName}" with ${models.length} models (strategy: ${strategy}, sticky: ${stickyLimit})`);

  return handleComboChat({
    body,
    models,
    handleSingleModel,
    log,
    comboName,
    comboStrategy: strategy,
    comboStickyLimit: stickyLimit,
    // Capability auto-switch inspects chat message shapes for images/audio/pdf to float a
    // vision-capable model forward. Media bodies carry none of those shapes, so the scan is
    // dead weight — and for STT the body is a FormData carrier it cannot read at all.
    autoSwitch: false,
    shouldFallbackFn,
  });
}
