import { describe, it, expect, beforeEach, vi } from "vitest";

import { resolveComboStrategy, handleComboChat, resetComboRotation } from "../../open-sse/services/combo.js";

const log = { info: () => {}, warn: () => {}, debug: () => {} };

// Minimal Response stub with the .ok / .status / .clone().json() surface the engine uses.
function stubResponse(status, payload) {
  const make = () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    clone: make,
    json: async () => payload,
  });
  return make();
}

describe("media combo strategy resolution", () => {
  it("prefers the per-combo strategy over the global one", () => {
    const settings = {
      comboStrategy: "fallback",
      comboStrategies: { "tts-combo": { fallbackStrategy: "round-robin" } },
      comboStickyRoundRobinLimit: 3,
    };
    expect(resolveComboStrategy("tts-combo", settings, { allowFusion: false })).toMatchObject({
      strategy: "round-robin",
      stickyLimit: 3,
    });
  });

  it("falls back to the global strategy, then to \"fallback\"", () => {
    expect(resolveComboStrategy("x", { comboStrategy: "round-robin" }, { allowFusion: false }).strategy).toBe("round-robin");
    expect(resolveComboStrategy("x", {}, { allowFusion: false }).strategy).toBe("fallback");
    expect(resolveComboStrategy("x", undefined, { allowFusion: false }).strategy).toBe("fallback");
  });

  it("coerces a stored fusion entry down to fallback for media kinds", () => {
    const settings = { comboStrategies: { "stt-combo": { fallbackStrategy: "fusion" } } };
    expect(resolveComboStrategy("stt-combo", settings, { allowFusion: false }).strategy).toBe("fallback");
    // The LLM path keeps fusion — the coercion is opt-in, not global.
    expect(resolveComboStrategy("stt-combo", settings).strategy).toBe("fusion");
  });

  it("coerces a global fusion setting too", () => {
    expect(resolveComboStrategy("c", { comboStrategy: "fusion" }, { allowFusion: false }).strategy).toBe("fallback");
  });
});

describe("media combo fallback behavior", () => {
  beforeEach(() => resetComboRotation());

  it("tries the next model on a retryable failure and returns the success", async () => {
    const seen = [];
    const handleSingleModel = vi.fn(async (_body, model) => {
      seen.push(model);
      if (model === "p1/embed") return stubResponse(429, { error: { message: "rate limited" } });
      return stubResponse(200, { data: [{ embedding: [0.1] }] });
    });

    const res = await handleComboChat({
      body: { input: "hi" },
      models: ["p1/embed", "p2/embed"],
      handleSingleModel,
      log,
      comboName: "embedding-combo",
      comboStrategy: "fallback",
      autoSwitch: false,
    });

    expect(seen).toEqual(["p1/embed", "p2/embed"]);
    expect(res.ok).toBe(true);
  });

  it("rebuilds a fresh FormData per STT attempt so the audio is replayable", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    const build = (model) => {
      const fd = new FormData();
      fd.append("file", new File([bytes], "audio.wav", { type: "audio/wav" }), "audio.wav");
      fd.append("language", "en");
      fd.append("model", model);
      return fd;
    };

    const sizes = [];
    const handleSingleModel = vi.fn(async (_body, model) => {
      const fd = build(model);
      const file = fd.get("file");
      // Consume the body the way an upstream POST would.
      sizes.push((await file.arrayBuffer()).byteLength);
      expect(fd.get("model")).toBe(model);
      expect(fd.get("language")).toBe("en");
      if (model === "p1/whisper") return stubResponse(401, { error: { message: "bad key" } });
      return stubResponse(200, { text: "hello" });
    });

    const res = await handleComboChat({
      models: ["p1/whisper", "p2/whisper"],
      handleSingleModel,
      log,
      comboName: "stt-combo",
      comboStrategy: "fallback",
      autoSwitch: false,
    });

    // Both attempts saw the full audio — the second was not handed a drained stream.
    expect(sizes).toEqual([4, 4]);
    expect(res.ok).toBe(true);
  });

  it("round-robin rotates the starting model across media requests", async () => {
    const starts = [];
    const handleSingleModel = vi.fn(async (_body, model) => {
      if (starts.length === 0 || starts[starts.length - 1] !== model) starts.push(model);
      return stubResponse(200, { ok: true });
    });

    for (let i = 0; i < 4; i++) {
      await handleComboChat({
        body: { prompt: "cat" },
        models: ["p1/img", "p2/img"],
        handleSingleModel,
        log,
        comboName: "image-combo",
        comboStrategy: "round-robin",
        autoSwitch: false,
      });
    }

    expect(starts).toEqual(["p1/img", "p2/img", "p1/img", "p2/img"]);
  });
});

describe("video combo retry predicate", () => {
  // Mirrors videoComboShouldFallback in src/sse/handlers/videoGeneration.js: creation POSTs
  // are billable, so a 5xx (job may already exist upstream) must not be re-sent.
  const videoComboShouldFallback = (status) => ({ shouldFallback: Number(status) < 500, cooldownMs: 0 });

  it("rotates to the next provider on a pre-creation rejection (429)", async () => {
    const seen = [];
    const handleSingleModel = vi.fn(async (_body, model) => {
      seen.push(model);
      if (model === "p1/vid") return stubResponse(429, { error: { message: "quota" } });
      return stubResponse(200, { id: "job_2" });
    });

    const res = await handleComboChat({
      body: { prompt: "surfing cat" },
      models: ["p1/vid", "p2/vid"],
      handleSingleModel,
      log,
      comboName: "video-combo",
      comboStrategy: "fallback",
      autoSwitch: false,
      shouldFallbackFn: videoComboShouldFallback,
    });

    expect(seen).toEqual(["p1/vid", "p2/vid"]);
    expect(res.status).toBe(200);
  });

  it("does NOT re-send on a 503 — the job may already have been created and billed", async () => {
    const seen = [];
    const handleSingleModel = vi.fn(async (_body, model) => {
      seen.push(model);
      return stubResponse(503, { error: { message: "upstream down" } });
    });

    const res = await handleComboChat({
      body: { prompt: "surfing cat" },
      models: ["p1/vid", "p2/vid"],
      handleSingleModel,
      log,
      comboName: "video-combo-2",
      comboStrategy: "fallback",
      autoSwitch: false,
      shouldFallbackFn: videoComboShouldFallback,
    });

    expect(seen).toEqual(["p1/vid"]);
    expect(res.status).toBe(503);
  });

  it("the default predicate WOULD have rotated on 503 (this is why the override exists)", async () => {
    const seen = [];
    const handleSingleModel = vi.fn(async (_body, model) => {
      seen.push(model);
      return stubResponse(503, { error: { message: "upstream down" } });
    });

    await handleComboChat({
      body: { prompt: "surfing cat" },
      models: ["p1/vid", "p2/vid"],
      handleSingleModel,
      log,
      comboName: "video-combo-3",
      comboStrategy: "fallback",
      autoSwitch: false,
    });

    expect(seen).toEqual(["p1/vid", "p2/vid"]);
  });
});
