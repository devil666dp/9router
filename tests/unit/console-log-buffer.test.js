import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  clearConsoleLogs, getConsoleBufferMax, getConsoleEmitter, getConsoleLogLines, getConsoleLogs,
  initConsoleLogCapture, setConsoleBufferMax,
} from "../../src/lib/consoleLogBuffer.js";
import { CONSOLE_LOG_CONFIG } from "../../src/shared/constants/config.js";

const LEVELS = ["log", "info", "warn", "error", "debug"];
const realConsole = {};
let passthrough = [];

beforeAll(() => {
  // Swap in no-op sinks BEFORE patching, so the capture wrapper's pass-through lands in
  // `passthrough` instead of the test reporter's output. The real methods go back in
  // afterAll — initConsoleLogCapture() is one-shot and has no un-patch.
  for (const level of LEVELS) {
    realConsole[level] = console[level];
    console[level] = (...args) => { passthrough.push([level, args]); };
  }
  initConsoleLogCapture();
});

afterAll(() => {
  for (const level of LEVELS) console[level] = realConsole[level];
  setConsoleBufferMax(CONSOLE_LOG_CONFIG.maxLines);
});

beforeEach(() => {
  clearConsoleLogs();
  passthrough = [];
  setConsoleBufferMax(CONSOLE_LOG_CONFIG.maxLines);
});

describe("capture", () => {
  it("records one structured entry per console call", () => {
    console.log("hello");
    const logs = getConsoleLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ level: "log", severity: "info", kind: "text", text: "hello" });
    expect(logs[0].seq).toBeGreaterThan(0);
    expect(typeof logs[0].at).toBe("number");
  });

  it("still forwards to the original console", () => {
    console.log("forwarded");
    expect(passthrough).toEqual([["log", ["forwarded"]]]);
  });

  it("keeps the console method as the severity source", () => {
    console.warn("a warning");
    console.error("a failure");
    console.debug("chatter");
    expect(getConsoleLogs().map((r) => r.severity)).toEqual(["warn", "error", "debug"]);
  });

  it("joins multiple arguments and serialises objects", () => {
    console.log("state:", { a: 1 }, 42);
    expect(getConsoleLogs()[0].text).toBe('state: {"a":1} 42');
  });

  it("keeps an Error's stack", () => {
    const error = new Error("boom");
    console.error("failed:", error);
    const [record] = getConsoleLogs();
    expect(record.text).toContain("boom");
    expect(record.text).toContain("at ");
    expect(record.severity).toBe("error");
  });

  it("strips ANSI colour codes", () => {
    // logger.request() wraps its line in cyan; the UI must never see the escapes.
    console.log("\x1b[36m[10:22:04] 📥 POST /v1/chat/completions\x1b[0m");
    const [record] = getConsoleLogs();
    expect(record.text).toBe("[10:22:04] 📥 POST /v1/chat/completions");
    expect(record.text).not.toContain("\x1b");
    expect(record.kind).toBe("http");
  });

  it("increments seq monotonically across levels", () => {
    console.log("one");
    console.warn("two");
    console.error("three");
    const seqs = getConsoleLogs().map((r) => r.seq);
    expect(seqs[1]).toBe(seqs[0] + 1);
    expect(seqs[2]).toBe(seqs[1] + 1);
  });

  // A throw inside capture would break every caller of console.* in the process.
  it("never throws out of a console call on an unserialisable argument", () => {
    const hostile = {
      toJSON() { throw new Error("no json"); },
      toString() { throw new Error("no string"); },
    };
    expect(() => console.log(hostile)).not.toThrow();
    expect(passthrough).toHaveLength(1);
  });
});

describe("parsing at capture", () => {
  it("parses a real request line into a lifecycle record", () => {
    console.log("[10:22:04] #0a3f 🟢 ▶ POST gpt-5 → openai/gpt-5 · FMT: openai (passthrough) · STREAM · 4 MSG · ACC:main");
    const [record] = getConsoleLogs();
    expect(record).toMatchObject({ kind: "request", reqId: "0a3f", dot: "🟢", symbol: "▶", time: "10:22:04" });
    expect(record.fields).toMatchObject({ provider: "openai", model: "gpt-5", stream: true, messages: 4 });
  });

  it("parses a done line and marks it successful", () => {
    console.log("[10:22:05] #0a3f 🟢 📊 DONE 812ms · TTFT 240ms · IN 4100 · OUT 380");
    const [record] = getConsoleLogs();
    expect(record.kind).toBe("done");
    expect(record.severity).toBe("success");
    expect(record.fields).toMatchObject({ totalMs: 812, ttftMs: 240 });
  });

  // tests/unit/rtk.e2e.test.js greps this exact string out of the log file.
  it("leaves an [RTK] line byte-identical", () => {
    const text = "[RTK] saved 1200B / 4000B (30.0%) via [git-diff] hits=2";
    console.log(text);
    expect(getConsoleLogs()[0].text).toBe(text);
    expect(getConsoleLogLines()).toEqual([text]);
  });

  it("exposes the raw strings for the raw view and .log export", () => {
    console.log("first");
    console.warn("second");
    expect(getConsoleLogLines()).toEqual(["first", "second"]);
  });
});

describe("ring buffer", () => {
  it("defaults to the compiled cap", () => {
    expect(getConsoleBufferMax()).toBe(CONSOLE_LOG_CONFIG.maxLines);
  });

  it("drops the oldest lines once full", () => {
    setConsoleBufferMax(50);
    for (let i = 0; i < 60; i++) console.log(`line ${i}`);
    const logs = getConsoleLogs();
    expect(logs).toHaveLength(50);
    expect(logs[0].text).toBe("line 10");
    expect(logs[49].text).toBe("line 59");
  });

  it("honours a raised cap immediately", () => {
    setConsoleBufferMax(50);
    for (let i = 0; i < 60; i++) console.log(`a ${i}`);
    expect(getConsoleLogs()).toHaveLength(50);

    setConsoleBufferMax(300);
    expect(getConsoleBufferMax()).toBe(300);
    for (let i = 0; i < 100; i++) console.log(`b ${i}`);
    expect(getConsoleLogs()).toHaveLength(150);
  });

  it("trims to the new cap when shrunk", () => {
    for (let i = 0; i < 120; i++) console.log(`c ${i}`);
    expect(setConsoleBufferMax(60)).toBe(60);
    const logs = getConsoleLogs();
    expect(logs).toHaveLength(60);
    expect(logs[59].text).toBe("c 119");
  });

  it("clamps an out-of-range or junk cap instead of trusting it", () => {
    expect(setConsoleBufferMax(1)).toBe(50);
    expect(setConsoleBufferMax(999999)).toBe(20000);
    expect(setConsoleBufferMax("abc")).toBe(50);
    expect(setConsoleBufferMax(null)).toBe(50);
    expect(setConsoleBufferMax(1000)).toBe(1000);
  });

  it("empties on clear", () => {
    console.log("x");
    clearConsoleLogs();
    expect(getConsoleLogs()).toEqual([]);
    expect(getConsoleLogLines()).toEqual([]);
  });
});

describe("emitter", () => {
  it("flushes a full batch synchronously", () => {
    const batches = [];
    const emitter = getConsoleEmitter();
    const onLines = (lines) => batches.push(lines);
    emitter.on("lines", onLines);
    try {
      // MAX_BATCH_LINES is 50 — the 50th line flushes without waiting for the timer.
      for (let i = 0; i < 50; i++) console.log(`batched ${i}`);
      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(50);
      expect(batches[0][0].text).toBe("batched 0");
    } finally {
      emitter.off("lines", onLines);
    }
  });

  it("flushes a partial batch on the timer", async () => {
    const batches = [];
    const emitter = getConsoleEmitter();
    const onLines = (lines) => batches.push(lines);
    emitter.on("lines", onLines);
    try {
      console.log("trickle");
      expect(batches).toHaveLength(0);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(batches).toHaveLength(1);
      expect(batches[0][0].text).toBe("trickle");
    } finally {
      emitter.off("lines", onLines);
    }
  });

  it("announces a clear so connected viewers reset", () => {
    let cleared = 0;
    const emitter = getConsoleEmitter();
    const onClear = () => { cleared++; };
    emitter.on("clear", onClear);
    try {
      clearConsoleLogs();
      expect(cleared).toBe(1);
    } finally {
      emitter.off("clear", onClear);
    }
  });
});
