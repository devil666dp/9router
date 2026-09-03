import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { frameOf, readChunk, reasoningOf, stripDoneTerminator, textOf } from "../../src/shared/utils/chatFrames.js";

const fixture = (name) =>
  readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), "utf8");

// Drain a whole response body the way the dashboard Playground does.
function drain(raw) {
  const out = { frames: 0, text: "", reasoning: "", usage: null, finishReason: null, model: "" };
  const lines = raw.split(/\r?\n/);
  const absorb = (frame) => {
    out.frames++;
    const piece = readChunk(frame);
    if (piece.usage) out.usage = piece.usage;
    if (piece.finishReason) out.finishReason = piece.finishReason;
    if (piece.model && !out.model) out.model = piece.model;
    out.text += piece.text;
    out.reasoning += piece.reasoning;
  };
  for (const line of lines) {
    const frame = frameOf(line);
    if (frame) absorb(frame);
  }
  if (out.frames === 0) {
    const whole = stripDoneTerminator(raw);
    if (whole) {
      try { absorb(JSON.parse(whole)); } catch { /* leave empty */ }
    }
  }
  return out;
}

describe("frameOf", () => {
  it("reads an SSE data: payload", () => {
    expect(frameOf('data: {"a":1}')).toEqual({ a: 1 });
  });

  it("reads a bare JSON object with no data: prefix", () => {
    expect(frameOf('{"a":1}')).toEqual({ a: 1 });
  });

  it("reads an object with the [DONE] terminator glued to its tail", () => {
    // The gateway emits exactly this for a non-streaming chat reply.
    expect(frameOf('{"a":1}data: [DONE]')).toEqual({ a: 1 });
  });

  it("returns null for terminators, blanks and non-JSON lines", () => {
    for (const line of ["", "  ", "data: [DONE]", "data:", ": keep-alive", "event: ping"]) {
      expect(frameOf(line)).toBeNull();
    }
  });

  it("returns null instead of throwing on malformed JSON", () => {
    expect(frameOf('data: {"a":')).toBeNull();
  });
});

describe("stripDoneTerminator", () => {
  it("removes a trailing terminator on its own line", () => {
    expect(stripDoneTerminator('{"a":1}\n\ndata: [DONE]\n')).toBe('{"a":1}');
  });

  it("leaves a body without one untouched", () => {
    expect(stripDoneTerminator(' {"a":1} ')).toBe('{"a":1}');
  });
});

describe("textOf / reasoningOf", () => {
  it("accepts a plain string or OpenAI content blocks", () => {
    expect(textOf("hi")).toBe("hi");
    expect(textOf([{ type: "text", text: "a" }, { type: "text", text: "b" }])).toBe("ab");
    expect(textOf(undefined)).toBe("");
  });

  it("accepts all three reasoning wire shapes", () => {
    expect(reasoningOf({ reasoning_content: "x" })).toBe("x");
    expect(reasoningOf({ reasoning: "y" })).toBe("y");
    expect(reasoningOf({ reasoning_details: [{ text: "p" }, { content: "q" }] })).toBe("pq");
    expect(reasoningOf(null)).toBe("");
  });
});

describe("readChunk", () => {
  it("reads a streaming delta and a whole message identically", () => {
    const delta = readChunk({ model: "m", choices: [{ delta: { content: "hi" }, finish_reason: null }] });
    const whole = readChunk({ model: "m", choices: [{ message: { content: "hi" }, finish_reason: "stop" }] });
    expect(delta.text).toBe("hi");
    expect(whole.text).toBe("hi");
    expect(whole.finishReason).toBe("stop");
    expect(delta.model).toBe("m");
  });
});

// Both fixtures are verbatim bodies captured from the local gateway
// (mistral/mistral-small-latest through /v1/chat/completions).
describe("draining real gateway bodies", () => {
  it("reads a non-streaming reply served as text/event-stream with [DONE] glued on", () => {
    const out = drain(fixture("chat-nonstream-done-glued.txt"));
    expect(out.frames).toBe(1);
    expect(out.model).toBe("mistral-small-latest");
    expect(out.finishReason).toBe("stop");
    expect(out.text).toContain("9Router");
    expect(out.usage).toMatchObject({ prompt_tokens: 27, completion_tokens: 22 });
  });

  it("accumulates a streaming reply and picks up include_usage", () => {
    const out = drain(fixture("chat-stream-sse.txt"));
    expect(out.frames).toBeGreaterThan(1);
    expect(out.model).toBe("mistral-small-latest");
    expect(out.finishReason).toBe("stop");
    expect(out.text).toContain("9Router");
    expect(out.usage.completion_tokens).toBeGreaterThan(0);
  });
});
