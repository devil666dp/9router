// Capability probes (src/app/api/models/test/probes.js): the dashboard's
// "does this model really support X" buttons. Every probe goes out through the
// local /api/v1 surface, so these tests stub global.fetch and assert on the
// request that was built and the verdict derived from the reply.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getApiKeys: vi.fn(),
  getConsistentMachineId: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({ getApiKeys: mocks.getApiKeys }));
vi.mock("@/shared/utils/machineId", () => ({ getConsistentMachineId: mocks.getConsistentMachineId }));

import { runProbe, runAllProbes, PROBE_CAPABILITIES } from "@/app/api/models/test/probes.js";
import { PROBE_FIXTURES } from "@/app/api/models/test/probeFixtures.js";
import { CAPABILITY_PROBE_HEADER } from "open-sse/config/runtimeConfig.js";

const originalFetch = global.fetch;

// Last request each stub saw, so assertions can inspect the built body/headers.
let calls = [];

function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Reply as an assistant message. */
const reply = (content) => jsonRes({ choices: [{ message: { role: "assistant", content } }] });

/** Stub fetch with a handler that receives ({url, body, headers}). */
function stubFetch(handler) {
  global.fetch = vi.fn((url, init) => {
    const parsedBody = init?.body ? JSON.parse(init.body) : null;
    const call = { url: String(url), body: parsedBody, headers: init?.headers || {} };
    calls.push(call);
    return Promise.resolve(handler(call));
  });
}

describe("capability probes", () => {
  beforeEach(() => {
    calls = [];
    vi.clearAllMocks();
    mocks.getApiKeys.mockResolvedValue([{ key: "sk-internal", isActive: true }]);
    mocks.getConsistentMachineId.mockResolvedValue("cli-token");
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("marks the request as a probe so the modality strip and capacity adapter stand down", async () => {
    stubFetch(() => reply(PROBE_FIXTURES.image.expect));
    await runProbe("vision", "oai/gpt-4o", "http://127.0.0.1:20128");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://127.0.0.1:20128/api/v1/chat/completions");
    expect(calls[0].headers[CAPABILITY_PROBE_HEADER]).toBe("1");
    // Rides the real path with real credentials, not a side channel.
    expect(calls[0].headers.Authorization).toBe("Bearer sk-internal");
    expect(calls[0].headers["x-9r-cli-token"]).toBe("cli-token");
  });

  it("sends each medium in the block shape its capability needs", async () => {
    stubFetch(() => reply("0000"));
    for (const cap of ["vision", "pdf", "audioInput", "videoInput"]) {
      await runProbe(cap, "oai/gpt-4o", "http://x");
    }
    const blockOf = (i) => calls[i].body.messages[0].content[1];

    expect(blockOf(0).image_url.url).toMatch(/^data:image\/png;base64,/);
    expect(blockOf(1).file.file_data).toMatch(/^data:application\/pdf;base64,/);
    expect(blockOf(2).input_audio).toMatchObject({ format: "mp3" });
    expect(blockOf(3).video_url.url).toMatch(/^data:video\/mp4;base64,/);
    // Non-streaming, with headroom for a reasoning model to think and still answer.
    expect(calls[0].body).toMatchObject({ stream: false, max_tokens: 1024 });
  });

  it("passes only when the model reads the fixture back", async () => {
    stubFetch(() => reply(`The number is ${PROBE_FIXTURES.image.expect}.`));
    await expect(runProbe("vision", "oai/gpt-4o", "http://x")).resolves.toMatchObject({
      capability: "vision",
      supported: true,
    });

    calls = [];
    stubFetch(() => reply("I can't see any image."));
    const miss = await runProbe("vision", "oai/gpt-4o", "http://x");
    expect(miss.supported).toBe(false);
    expect(miss.error).toContain(PROBE_FIXTURES.image.expect);
  });

  it("accepts spelled-out digits, so the spoken audio fixture matches", async () => {
    stubFetch(() => reply("I hear the digits six one nine two."));
    await expect(runProbe("audioInput", "oai/gpt-4o", "http://x")).resolves.toMatchObject({ supported: true });
  });

  it("finds the answer in a reasoning field when the output budget ran out", async () => {
    stubFetch(() => jsonRes({
      choices: [{ message: { role: "assistant", content: "", reasoning_content: `it says ${PROBE_FIXTURES.pdf.expect}` } }],
    }));
    await expect(runProbe("pdf", "oai/gpt-4o", "http://x")).resolves.toMatchObject({ supported: true });
  });

  it("reports null, not false, when the failure says nothing about the capability", async () => {
    for (const status of [401, 429, 500]) {
      calls = [];
      stubFetch(() => jsonRes({ error: { message: "nope" } }, status));
      const r = await runProbe("vision", "oai/gpt-4o", "http://x");
      expect(r.supported, `status ${status}`).toBeNull();
      expect(r.status).toBe(status);
    }

    calls = [];
    stubFetch(() => jsonRes({ error: { message: "model does not support image input" } }, 400));
    await expect(runProbe("vision", "oai/gpt-4o", "http://x")).resolves.toMatchObject({ supported: false });
  });

  it("counts a tool call as tool support and a text answer as its absence", async () => {
    stubFetch(() => jsonRes({
      choices: [{ message: { role: "assistant", tool_calls: [{ id: "c1", type: "function", function: { name: "get_probe_code", arguments: '{"room":"atrium"}' } }] } }],
    }));
    const hit = await runProbe("tools", "oai/gpt-4o", "http://x");
    expect(hit).toMatchObject({ supported: true });
    expect(hit.detail).toContain("atrium");
    expect(calls[0].body.tools[0].function.name).toBe("get_probe_code");

    calls = [];
    stubFetch(() => reply("The code is 1234."));
    await expect(runProbe("tools", "oai/gpt-4o", "http://x")).resolves.toMatchObject({ supported: false });
  });

  it("probes web search through /v1/search for a provider wired for it", async () => {
    stubFetch(() => jsonRes({ provider: "perplexity", results: [{ title: "t", url: "https://example.com" }] }));
    const r = await runProbe("search", "perplexity/sonar", "http://x");
    expect(r.supported).toBe(true);
    expect(calls[0].url).toContain("/api/v1/search");
    expect(calls[0].body).toMatchObject({ model: "perplexity", query: expect.any(String) });
  });

  it("falls back to an inline web_search tool and needs a citation to pass", async () => {
    // A provider with no searchConfig/searchViaChat never touches /v1/search.
    stubFetch(() => jsonRes({
      choices: [{ message: { role: "assistant", content: "They shipped a model.", annotations: [{ url_citation: { url: "https://anthropic.com/news" } }] } }],
    }));
    const cited = await runProbe("search", "oai/gpt-4o", "http://x");
    expect(cited.supported).toBe(true);
    expect(calls[0].url).toContain("/api/v1/chat/completions");
    expect(calls[0].body.tools).toEqual([{ type: "web_search" }]);

    calls = [];
    stubFetch(() => reply("They shipped a model, I think."));
    await expect(runProbe("search", "oai/gpt-4o", "http://x")).resolves.toMatchObject({ supported: false });
  });

  it("rejects an unknown capability without calling out", async () => {
    stubFetch(() => reply("x"));
    const r = await runProbe("telepathy", "oai/gpt-4o", "http://x");
    expect(r).toMatchObject({ supported: null });
    expect(r.error).toContain("telepathy");
    expect(calls).toHaveLength(0);
  });

  it("never throws out of a probe, even when fetch does", async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error("ECONNREFUSED")));
    await expect(runProbe("vision", "oai/gpt-4o", "http://x")).resolves.toMatchObject({
      supported: null,
      error: "ECONNREFUSED",
    });
  });

  it("sweeps every capability sequentially and buckets the verdicts", async () => {
    let n = 0;
    // vision passes, tools fails, everything else is inconclusive.
    stubFetch(({ body }) => {
      n += 1;
      if (body?.tools?.[0]?.function?.name === "get_probe_code") return reply("no tool for me");
      if (n === 2) return reply(PROBE_FIXTURES.image.expect);
      return jsonRes({ error: { message: "rate limited" } }, 429);
    });

    const sweep = await runAllProbes("oai/gpt-4o", "http://x");
    expect(Object.keys(sweep.results)).toEqual(PROBE_CAPABILITIES);
    expect(sweep.summary.supported).toEqual(["vision"]);
    expect(sweep.summary.unsupported).toEqual(["tools"]);
    expect(sweep.summary.unknown).toEqual(["pdf", "audioInput", "videoInput", "search"]);
    // Cheapest probe first, and one request per capability — no parallel burst.
    expect(calls).toHaveLength(PROBE_CAPABILITIES.length);
    expect(calls[0].body.tools).toBeTruthy();
  });
});
