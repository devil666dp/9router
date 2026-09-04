import { describe, expect, it } from "vitest";
import { parseConsoleLine, meetsSeverity, SEVERITIES } from "../../src/shared/utils/consoleLogRecord.js";

// Every fixture below is the exact shape one of the repo's emitters produces:
//   src/sse/utils/logger.js            line/errorLine/debug/info/warn/error/request/response/stream
//   open-sse/handlers/chatCore.js      the ▶ / ⚙ / ✗ / 🔑 lines
//   open-sse/handlers/chatCore/requestDetail.js  formatDoneLine → 📊
//   open-sse/utils/streamHandler.js    ⚡ ABORTED / ✗ ERROR
//   open-sse/rtk/index.js              bare console.log("[RTK] …")

describe("parseConsoleLine — request line", () => {
  const text = "[10:22:04] #0a3f 🟢 ▶ POST claude-sonnet-4-5 → anthropic/claude-sonnet-4-5-20250929 · FMT: claude→openai · STREAM · 12 MSG · 3 TOOL · THINK:10k · ACC:main";

  it("splits time, request id, session dot and symbol", () => {
    const r = parseConsoleLine("log", text);
    expect(r.time).toBe("10:22:04");
    expect(r.reqId).toBe("0a3f");
    expect(r.dot).toBe("🟢");
    expect(r.symbol).toBe("▶");
    expect(r.kind).toBe("request");
    expect(r.severity).toBe("info");
  });

  it("extracts the routing, format and payload fields", () => {
    const { fields } = parseConsoleLine("log", text);
    expect(fields).toMatchObject({
      clientModel: "claude-sonnet-4-5",
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250929",
      sourceFormat: "claude",
      targetFormat: "openai",
      passthrough: false,
      stream: true,
      messages: 12,
      tools: 3,
      thinking: "10k",
      account: "main",
    });
  });

  it("reads a passthrough format and a JSON (non-stream) request", () => {
    const { fields } = parseConsoleLine(
      "log",
      "[10:22:04] #0a3f 🔵 ▶ POST gpt-5 → openai/gpt-5 · FMT: openai (passthrough) · JSON · 2 MSG · ACC:-"
    );
    expect(fields.passthrough).toBe(true);
    expect(fields.sourceFormat).toBe("openai");
    expect(fields.targetFormat).toBe("openai");
    expect(fields.stream).toBe(false);
    expect(fields.tools).toBeUndefined();
    expect(fields.account).toBe("-");
  });

  it("keeps the original text verbatim for the raw view", () => {
    expect(parseConsoleLine("log", text).text).toBe(text);
  });

  it("reads the arrow-less form emitted when the client asked for the resolved route", () => {
    // chatCore drops the "client → route" arrow when both sides are identical, which is
    // the common case for a direct provider/model call.
    const { fields } = parseConsoleLine(
      "log",
      "[12:30:58] #00nx ⚪ ▶ POST myendpoint/claude-opus-5-thinking · FMT: openai→openai · JSON · 1 MSG · ACC:Key 1"
    );
    expect(fields).toMatchObject({
      clientModel: "myendpoint/claude-opus-5-thinking",
      provider: "myendpoint",
      model: "claude-opus-5-thinking",
      sourceFormat: "openai",
      targetFormat: "openai",
      stream: false,
      messages: 1,
      account: "Key 1",
    });
  });

  it("still yields a client model when the route has no provider prefix", () => {
    const { fields } = parseConsoleLine("log", "[10:22:04] #0a3f 🟢 ▶ POST gpt-5 · JSON · 1 MSG");
    expect(fields.clientModel).toBe("gpt-5");
    expect(fields.provider).toBeUndefined();
  });
});

describe("parseConsoleLine — done line", () => {
  it("reads latency, ttft and token counts", () => {
    const r = parseConsoleLine("log", "[10:22:05] #0a3f 🟢 📊 DONE 812ms · TTFT 240ms · IN 4100 · OUT 380");
    expect(r.kind).toBe("done");
    expect(r.severity).toBe("success");
    expect(r.fields).toMatchObject({ totalMs: 812, ttftMs: 240, inTokens: 4100, outTokens: 380 });
  });

  it("reads the cache breakdown", () => {
    const { fields } = parseConsoleLine("log", "[10:22:05] #0a3f 🟢 📊 DONE 900ms · IN 5000 (CACHE ↻2000 +512) · OUT 120");
    expect(fields.cacheRead).toBe(2000);
    expect(fields.cacheCreate).toBe(512);
    expect(fields.inTokens).toBe(5000);
  });

  it("survives a done line with no ttft and zero tokens", () => {
    const { fields } = parseConsoleLine("log", "[10:22:05] #0a3f 🟢 📊 DONE 0ms · IN 0 · OUT 0");
    expect(fields).toMatchObject({ totalMs: 0, inTokens: 0, outTokens: 0 });
    expect(fields.ttftMs).toBeUndefined();
  });
});

describe("parseConsoleLine — failures", () => {
  it("reads status, route, latency, url and the indented detail", () => {
    const text = [
      "[10:22:07] #7c21 🔴 ✗ ERROR 429 · openai/gpt-5 · 812ms",
      "    URL: https://api.openai.com/v1/chat/completions",
      "    rate limit reached for gpt-5",
    ].join("\n");
    const r = parseConsoleLine("log", text);
    expect(r.kind).toBe("error");
    expect(r.severity).toBe("error");
    expect(r.fields).toMatchObject({
      status: 429,
      provider: "openai",
      model: "gpt-5",
      latencyMs: 812,
      url: "https://api.openai.com/v1/chat/completions",
      detail: "rate limit reached for gpt-5",
    });
  });

  it("reads a BLOCKED non-SSE response", () => {
    const { fields, kind } = parseConsoleLine(
      "log",
      "[10:22:07] #7c21 🔴 ✗ BLOCKED 400 · kiro/claude · non-SSE (application/json)\n    bad request"
    );
    expect(kind).toBe("error");
    expect(fields.status).toBe(400);
  });

  it("marks an abort without inventing a status", () => {
    const r = parseConsoleLine("log", "[10:22:07] #7c21 🟡 ⚡ ABORTED · openai/gpt-5 · 120ms");
    expect(r.kind).toBe("aborted");
    expect(r.severity).toBe("error");
    expect(r.fields.aborted).toBe(true);
    expect(r.fields.latencyMs).toBe(120);
    expect(r.fields.status).toBeUndefined();
  });

  // streamHandler.js builds "<status> · provider/model · Nms", so a thrown error's stack
  // lands BETWEEN the status and the route. Both shapes must yield the same fields.
  it("reads a stream error whose stack precedes the route", () => {
    const r = parseConsoleLine(
      "log",
      "[10:22:07] #7c21 🔴 ✗ ERROR: socket hang up\n    Error: socket hang up\n        at TLSSocket.onHangUp (net.js:1:1) · openai/gpt-5 · 4210ms"
    );
    expect(r.kind).toBe("error");
    expect(r.fields).toMatchObject({ provider: "openai", model: "gpt-5", latencyMs: 4210 });
    expect(r.fields.status).toBeUndefined();
    expect(r.fields.detail).toContain("at TLSSocket.onHangUp");
    // The route must not be left dangling on the last line of the trace.
    expect(r.fields.detail).not.toContain("4210ms");
  });

  it("keeps a multi-line stack trace in detail", () => {
    const { fields } = parseConsoleLine(
      "log",
      "[10:22:07] #7c21 🔴 ✗ ERROR 502 · x/y · 10ms\n    boom\n    at foo (bar.js:1:1)\n    at baz (qux.js:2:2)"
    );
    expect(fields.detail).toBe("boom\nat foo (bar.js:1:1)\nat baz (qux.js:2:2)");
  });
});

describe("parseConsoleLine — savers and refresh", () => {
  it("splits the token-saver list", () => {
    const r = parseConsoleLine("log", "[10:22:04] #0a3f 🟢 ⚙ CAVEMAN:full · PONYTAIL:2 · PXPIPE:3img");
    expect(r.kind).toBe("savers");
    expect(r.fields.savers).toEqual(["CAVEMAN:full", "PONYTAIL:2", "PXPIPE:3img"]);
  });

  it("reads the route off a token refresh", () => {
    const r = parseConsoleLine("log", "[10:22:04] #0a3f 🟢 🔑 TOKEN REFRESHED · gemini-cli/gemini-2.5-pro");
    expect(r.kind).toBe("refresh");
    expect(r.fields).toMatchObject({ provider: "gemini-cli", model: "gemini-2.5-pro" });
  });
});

describe("parseConsoleLine — the icon family", () => {
  it("reads a tagged info line", () => {
    const r = parseConsoleLine("log", "[10:22:04] ℹ️  [HEADROOM] saved 120 tokens");
    expect(r.kind).toBe("system");
    expect(r.tag).toBe("HEADROOM");
    expect(r.severity).toBe("info");
    expect(r.message).toBe("saved 120 tokens");
  });

  it("reads a warning through console.warn", () => {
    const r = parseConsoleLine("warn", "[10:22:04] ⚠️  [TOKEN] OPENAI | refresh failed");
    expect(r.severity).toBe("warn");
    expect(r.tag).toBe("TOKEN");
  });

  it("reads a debug line", () => {
    const r = parseConsoleLine("log", "[10:22:04] 🔍 [REQUEST] OPENAI | gpt-5 | 4 msgs");
    expect(r.severity).toBe("debug");
    expect(r.tag).toBe("REQUEST");
  });

  it("reads an inbound http line (ANSI already stripped by the buffer)", () => {
    const r = parseConsoleLine("log", "[10:22:04] 📥 POST /v1/chat/completions");
    expect(r.kind).toBe("http");
    expect(r.fields).toMatchObject({ method: "POST", path: "/v1/chat/completions" });
  });

  it("reads a response line and its error twin", () => {
    expect(parseConsoleLine("log", "[10:22:04] 📤 200 (812ms)").fields).toMatchObject({ status: 200, latencyMs: 812 });
    const bad = parseConsoleLine("log", "[10:22:04] 💥 502 (30ms)");
    expect(bad.severity).toBe("error");
    expect(bad.fields.status).toBe(502);
  });

  it("reads a stream line", () => {
    const r = parseConsoleLine("log", "[10:22:04] 🌊 [STREAM] chunk");
    expect(r.kind).toBe("stream");
    expect(r.tag).toBe("STREAM");
  });
});

describe("parseConsoleLine — bare console.log", () => {
  it("reads a [RTK] line without disturbing its text", () => {
    const text = "[RTK] saved 1200B / 4000B (30.0%) via [git-diff] hits=2";
    const r = parseConsoleLine("log", text);
    expect(r.tag).toBe("RTK");
    expect(r.kind).toBe("system");
    expect(r.reqId).toBe("");
    // The RTK e2e tests regex this exact string out of the log file.
    expect(r.text).toBe(text);
  });

  it("reads a [DB] migration line", () => {
    const r = parseConsoleLine("log", "[DB][migrate] applied #7 add_request_details");
    expect(r.tag).toBe("DB");
    expect(r.message).toContain("[migrate] applied #7");
  });

  it("treats unparseable output as plain text at the console level", () => {
    const r = parseConsoleLine("error", "something went very wrong");
    expect(r.kind).toBe("text");
    expect(r.severity).toBe("error");
    expect(r.message).toBe("something went very wrong");
  });

  it("does not throw on a non-string argument", () => {
    expect(() => parseConsoleLine("log", undefined)).not.toThrow();
    expect(parseConsoleLine("log", undefined).text).toBe("");
  });

  it("falls back to a safe level for an unknown console method", () => {
    const r = parseConsoleLine("trace", "hello");
    expect(r.level).toBe("log");
    expect(r.severity).toBe("info");
  });
});

describe("parseConsoleLine — legacy lines with no request id", () => {
  it("still groups by kind when the id is absent", () => {
    const r = parseConsoleLine("log", "[10:22:04] 🟢 ▶ POST gpt-5 → openai/gpt-5 · FMT: openai (passthrough) · JSON · 1 MSG · ACC:-");
    expect(r.reqId).toBe("");
    expect(r.kind).toBe("request");
    expect(r.fields.provider).toBe("openai");
  });
});

describe("meetsSeverity", () => {
  it("orders debug below error", () => {
    expect(SEVERITIES.indexOf("debug")).toBeLessThan(SEVERITIES.indexOf("error"));
  });

  it("passes anything at or above the floor", () => {
    expect(meetsSeverity("error", "warn")).toBe(true);
    expect(meetsSeverity("warn", "warn")).toBe(true);
    expect(meetsSeverity("info", "warn")).toBe(false);
    expect(meetsSeverity("debug", "debug")).toBe(true);
  });

  it("does not filter on an unknown severity", () => {
    expect(meetsSeverity("bogus", "warn")).toBe(true);
  });
});
