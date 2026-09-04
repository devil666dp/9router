import { describe, it, expect, beforeEach, vi } from "vitest";

// resolveProviderLabel is what keeps a generated provider-node id
// ("openai-compatible-chat-<uuid>") out of every console log line. It runs on the hot
// path of every request, so it must never throw and must not re-query the DB per call.

const mocks = vi.hoisted(() => ({
  getProviderNodeById: vi.fn(),
  getProviderNodes: vi.fn(),
  getModelAliases: vi.fn(),
  getComboByName: vi.fn(),
}));

vi.mock("@/lib/localDb", () => mocks);

describe("resolveProviderLabel", () => {
  let resolveProviderLabel;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Fresh module per test: the resolver memoises, and the cache is module state.
    vi.resetModules();
    ({ resolveProviderLabel } = await import("@/sse/services/model.js"));
  });

  it("prefers the prefix the user typed over the generated id", async () => {
    mocks.getProviderNodeById.mockResolvedValue({
      id: "openai-compatible-chat-9200568c-c82b-4c4b-937a-cce08a6a96eb",
      name: "pollination",
      prefix: "pollinations",
    });
    await expect(
      resolveProviderLabel("openai-compatible-chat-9200568c-c82b-4c4b-937a-cce08a6a96eb")
    ).resolves.toBe("pollinations");
  });

  it("falls back to the node's display name when it has no prefix", async () => {
    mocks.getProviderNodeById.mockResolvedValue({ id: "anthropic-compatible-x", name: "My Endpoint", prefix: "  " });
    await expect(resolveProviderLabel("anthropic-compatible-x")).resolves.toBe("My Endpoint");
  });

  it("keeps the id when the node is gone or unnamed", async () => {
    mocks.getProviderNodeById.mockResolvedValue(null);
    await expect(resolveProviderLabel("custom-embedding-nope")).resolves.toBe("custom-embedding-nope");
  });

  it("never touches the DB for a built-in provider", async () => {
    await expect(resolveProviderLabel("openai")).resolves.toBe("openai");
    await expect(resolveProviderLabel("anthropic")).resolves.toBe("anthropic");
    expect(mocks.getProviderNodeById).not.toHaveBeenCalled();
  });

  it("resolves an id that does not match a known custom prefix", async () => {
    // A node written with a broken id ("undefined<uuid>") still deserves a readable label.
    mocks.getProviderNodeById.mockResolvedValue({ id: "undefined3a096453", prefix: "voidai" });
    await expect(resolveProviderLabel("undefined3a096453")).resolves.toBe("voidai");
  });

  it("memoises so a hot path does not re-query per request", async () => {
    mocks.getProviderNodeById.mockResolvedValue({ id: "openai-compatible-chat-1", prefix: "mine" });
    for (let i = 0; i < 5; i++) {
      await expect(resolveProviderLabel("openai-compatible-chat-1")).resolves.toBe("mine");
    }
    expect(mocks.getProviderNodeById).toHaveBeenCalledTimes(1);
  });

  it("falls back to the id instead of throwing when the DB errors", async () => {
    mocks.getProviderNodeById.mockRejectedValue(new Error("db locked"));
    await expect(resolveProviderLabel("openai-compatible-chat-2")).resolves.toBe("openai-compatible-chat-2");
  });

  it("does not cache a failed lookup", async () => {
    mocks.getProviderNodeById.mockRejectedValueOnce(new Error("db locked"));
    await expect(resolveProviderLabel("openai-compatible-chat-3")).resolves.toBe("openai-compatible-chat-3");
    mocks.getProviderNodeById.mockResolvedValue({ id: "openai-compatible-chat-3", prefix: "later" });
    await expect(resolveProviderLabel("openai-compatible-chat-3")).resolves.toBe("later");
  });

  it("passes non-string input straight through", async () => {
    await expect(resolveProviderLabel(undefined)).resolves.toBeUndefined();
    await expect(resolveProviderLabel(null)).resolves.toBeNull();
    await expect(resolveProviderLabel("")).resolves.toBe("");
    expect(mocks.getProviderNodeById).not.toHaveBeenCalled();
  });
});
