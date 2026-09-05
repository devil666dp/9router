// Some OpenAI-compatible relays fronting Bedrock/CodeWhisperer smuggle the reasoning
// signature into the tool-call id as `<id>~sig1:<base64>`, because OpenAI's chat schema
// has nowhere else to carry it (the same value is also sent in a non-standard
// `signature` field). Two bugs followed from letting that id through untouched:
//
//   1. The suffix reached the client, so Claude Code stored 3.6KB-18KB tool_use ids.
//   2. When the client echoed one back, ensureToolCallIds() sanitized it in place --
//      deleting `~`, `:`, `+`, `/`, `=` -- which corrupted the base64 payload and
//      destroyed the `~sig1:` marker. The relay could no longer split the signature
//      off, forwarded a multi-KB toolUseId upstream, and every request in that
//      conversation failed with 400 REQUEST_BODY_INVALID "Invalid tool use format."
//      until the id left the history (/clear or compaction).
//
// Cutting the suffix off instead of scrubbing its characters fixes both.
import { describe, it, expect } from "vitest";
import { ensureToolCallIds } from "../../open-sse/translator/concerns/toolCall.js";
import { openaiToClaudeResponse } from "../../open-sse/translator/response/openai-to-claude.js";
import { translateNonStreamingResponse } from "../../open-sse/handlers/chatCore/nonStreamingHandler.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const REAL_ID = "toolu_bdrk_01HxgY2TLULtpq5LJCaYj212";
const SIG_ID = `${REAL_ID}~sig1:CAIS+Ygg/wE=`;

describe("ensureToolCallIds — relay-smuggled signature suffix", () => {
  it("cuts the suffix off a Claude tool_use id instead of scrubbing its characters", () => {
    const body = {
      messages: [
        { role: "assistant", content: [{ type: "tool_use", id: SIG_ID, name: "Bash", input: {} }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: SIG_ID, content: "ok" }] },
      ],
    };
    ensureToolCallIds(body);
    expect(body.messages[0].content[0].id).toBe(REAL_ID);
    expect(body.messages[1].content[0].tool_use_id).toBe(REAL_ID);
  });

  it("cuts the suffix off OpenAI tool_calls and their tool replies", () => {
    const body = {
      messages: [
        { role: "assistant", tool_calls: [{ id: SIG_ID, type: "function", function: { name: "Bash", arguments: "{}" } }] },
        { role: "tool", tool_call_id: SIG_ID, content: "ok" },
      ],
    };
    ensureToolCallIds(body);
    expect(body.messages[0].tool_calls[0].id).toBe(REAL_ID);
    expect(body.messages[1].tool_call_id).toBe(REAL_ID);
  });

  it("keeps ids paired so tool_use and tool_result still reference each other", () => {
    const body = {
      messages: [
        { role: "assistant", content: [{ type: "tool_use", id: SIG_ID, name: "Bash", input: {} }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: SIG_ID, content: "ok" }] },
      ],
    };
    ensureToolCallIds(body);
    expect(body.messages[1].content[0].tool_use_id).toBe(body.messages[0].content[0].id);
  });

  it("still scrubs illegal characters when there is no signature marker (ids stay distinct)", () => {
    const body = {
      messages: [
        { role: "assistant", tool_calls: [
          { id: "call/a:1", type: "function", function: { name: "A", arguments: "{}" } },
          { id: "call/a:2", type: "function", function: { name: "B", arguments: "{}" } },
        ] },
      ],
    };
    ensureToolCallIds(body);
    expect(body.messages[0].tool_calls.map(tc => tc.id)).toEqual(["calla1", "calla2"]);
  });

  it("leaves a well-formed id untouched", () => {
    const body = { messages: [{ role: "assistant", tool_calls: [{ id: REAL_ID, type: "function", function: { name: "Bash", arguments: "{}" } }] }] };
    ensureToolCallIds(body);
    expect(body.messages[0].tool_calls[0].id).toBe(REAL_ID);
  });
});

describe("openai -> claude response — relay-smuggled signature suffix", () => {
  it("does not leak the suffix into a streamed tool_use block", () => {
    const state = { toolCalls: new Map() };
    const events = openaiToClaudeResponse({
      id: "chatcmpl-x",
      model: "claude-opus-5",
      choices: [{ delta: { tool_calls: [{ index: 0, id: SIG_ID, function: { name: "Bash", arguments: "" } }] } }],
    }, state);
    const start = events.find(e => e.type === "content_block_start" && e.content_block?.type === "tool_use");
    expect(start.content_block.id).toBe(REAL_ID);
  });

  it("does not leak the suffix into a non-streamed tool_use block", () => {
    const out = translateNonStreamingResponse({
      id: "chatcmpl-x",
      model: "claude-opus-5",
      choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: "", tool_calls: [{ id: SIG_ID, function: { name: "Bash", arguments: "{}" } }] } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }, FORMATS.OPENAI, FORMATS.CLAUDE);
    expect(out.content.find(b => b.type === "tool_use").id).toBe(REAL_ID);
  });
});
