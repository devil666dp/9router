import { describe, expect, it } from "vitest";
import { parseConsoleLine } from "../../src/shared/utils/consoleLogRecord.js";
import {
  buildFacets, computeStats, filterItems, groupRecords, isInFlight, itemsToRecords,
  toJsonExport, toLogText,
} from "../../src/app/(dashboard)/dashboard/console-log/utils/consoleGroups.js";

let seq = 0;
const T0 = 1_700_000_000_000;

/** Build a record the way src/lib/consoleLogBuffer.js does: parse, then stamp seq/at. */
function rec(text, { level = "log", at = T0 } = {}) {
  const record = parseConsoleLine(level, text);
  record.seq = ++seq;
  record.at = at;
  return record;
}

const REQ = (id, { provider = "openai", model = "gpt-5", stream = true, msgs = 4, acc = "main" } = {}) =>
  `[10:22:04] #${id} 🟢 ▶ POST ${model} → ${provider}/${model} · FMT: openai (passthrough) · ${stream ? "STREAM" : "JSON"} · ${msgs} MSG · ACC:${acc}`;
const DONE = (id, { ms = 500, ttft = 100, inTok = 1000, outTok = 200 } = {}) =>
  `[10:22:05] #${id} 🟢 📊 DONE ${ms}ms · TTFT ${ttft}ms · IN ${inTok} · OUT ${outTok}`;
const ERR = (id, { status = 429, provider = "openai", model = "gpt-5", ms = 300, detail = "rate limited" } = {}) =>
  `[10:22:06] #${id} 🔴 ✗ ERROR ${status} · ${provider}/${model} · ${ms}ms\n    URL: https://api.example.com/v1\n    ${detail}`;
const ABORT = (id, { provider = "openai", model = "gpt-5", ms = 90 } = {}) =>
  `[10:22:06] #${id} 🟡 ⚡ ABORTED · ${provider}/${model} · ${ms}ms`;
const SAVERS = (id, body = "CAVEMAN:full · PXPIPE:2img") => `[10:22:04] #${id} 🟢 ⚙ ${body}`;
const REFRESH = (id) => `[10:22:04] #${id} 🟢 🔑 TOKEN REFRESHED · openai/gpt-5`;

describe("groupRecords", () => {
  it("folds one request's lifecycle into a single group", () => {
    const items = groupRecords([
      rec(REQ("0001")), rec(SAVERS("0001")), rec(REFRESH("0001")), rec(DONE("0001")),
    ]);
    expect(items).toHaveLength(1);
    const [group] = items;
    expect(group.type).toBe("request");
    expect(group.reqId).toBe("0001");
    expect(group.records).toHaveLength(4);
    expect(group).toMatchObject({
      provider: "openai",
      model: "gpt-5",
      status: "success",
      severity: "success",
      totalMs: 500,
      ttftMs: 100,
      inTokens: 1000,
      outTokens: 200,
      savers: ["CAVEMAN:full", "PXPIPE:2img"],
      refreshed: true,
      account: "main",
      stream: true,
    });
  });

  it("keeps concurrent requests apart even when their lines interleave", () => {
    const items = groupRecords([
      rec(REQ("000a")), rec(REQ("000b", { provider: "anthropic", model: "claude-sonnet-4-5" })),
      rec(DONE("000b", { ms: 700 })), rec(DONE("000a", { ms: 200 })),
    ]);
    expect(items).toHaveLength(2);
    // Order follows first appearance, not completion.
    expect(items.map((g) => g.reqId)).toEqual(["000a", "000b"]);
    expect(items[0].totalMs).toBe(200);
    expect(items[1]).toMatchObject({ provider: "anthropic", totalMs: 700 });
  });

  it("places a terminal line arriving before its request in the right group", () => {
    const done = rec(DONE("00c1"));
    const req = rec(REQ("00c1"));
    const [group] = groupRecords([done, req]);
    expect(group.records).toHaveLength(2);
    expect(group.status).toBe("success");
    expect(group.provider).toBe("openai");
    // firstSeq tracks the earliest line, so ordering elsewhere stays stable.
    expect(group.firstSeq).toBe(done.seq);
  });

  it("marks a request in flight until a terminal line lands", () => {
    const [pending] = groupRecords([rec(REQ("00d1")), rec(SAVERS("00d1"))]);
    expect(pending.status).toBe("pending");
    expect(isInFlight(pending)).toBe(true);

    const [finished] = groupRecords([rec(REQ("00d2")), rec(DONE("00d2"))]);
    expect(isInFlight(finished)).toBe(false);
  });

  it("records an error with its status, route, url and detail", () => {
    const [group] = groupRecords([rec(REQ("00e1")), rec(ERR("00e1", { status: 503, detail: "upstream down" }))]);
    expect(group).toMatchObject({
      status: "error",
      severity: "error",
      statusCode: 503,
      totalMs: 300,
      errorText: "upstream down",
      errorUrl: "https://api.example.com/v1",
    });
  });

  it("treats an abort on an unfinished request as the outcome", () => {
    const [group] = groupRecords([rec(REQ("00f1")), rec(ABORT("00f1"))]);
    expect(group.status).toBe("aborted");
    expect(group.severity).toBe("error");
    expect(group.totalMs).toBe(90);
  });

  // codex/droid close the socket after every completed request, so the ⚡ line follows
  // a perfectly successful 📊 line constantly. Downgrading there would paint the whole
  // console red for the busiest clients.
  it("never downgrades a completed request when an abort arrives afterwards", () => {
    const [group] = groupRecords([rec(REQ("0101")), rec(DONE("0101", { ms: 640 })), rec(ABORT("0101", { ms: 645 }))]);
    expect(group.status).toBe("success");
    expect(group.severity).toBe("success");
    expect(group.totalMs).toBe(640);
  });

  it("keeps an error final even if a late abort follows", () => {
    const [group] = groupRecords([rec(REQ("0102")), rec(ERR("0102")), rec(ABORT("0102"))]);
    expect(group.status).toBe("error");
    expect(group.statusCode).toBe(429);
  });

  it("leaves non-request output standalone in stream order", () => {
    const items = groupRecords([
      rec("[RTK] saved 1200B / 4000B (30.0%) via [git-diff] hits=2"),
      rec(REQ("0201")),
      rec("[10:22:04] ⚠️  [TOKEN] refresh failed", { level: "warn" }),
      rec(DONE("0201")),
    ]);
    expect(items.map((i) => i.type)).toEqual(["system", "request", "system"]);
    expect(items[0].record.tag).toBe("RTK");
    expect(items[2].record.severity).toBe("warn");
  });

  it("does not group lifecycle lines that carry no request id", () => {
    const items = groupRecords([
      rec("[10:22:04] 🟢 ▶ POST gpt-5 → openai/gpt-5 · FMT: openai (passthrough) · JSON · 1 MSG · ACC:-"),
      rec("[10:22:05] 🟢 📊 DONE 100ms · IN 5 · OUT 5"),
    ]);
    // No id means no correlation is possible — two standalone rows beats a wrong merge.
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.type === "system")).toBe(true);
  });

  it("gives every item a stable unique key", () => {
    const items = groupRecords([rec(REQ("0301")), rec(DONE("0301")), rec("[DB] ready"), rec("[DB] ready")]);
    const keys = items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps keys unique when two records share a seq", () => {
    // `seq` restarts at 1 with the server process, so a buffer spanning a restart can
    // hold repeats. React needs the key unique per render, not globally.
    const a = rec("[DB] ready");
    const b = rec("[DB] ready");
    b.seq = a.seq;
    const keys = groupRecords([a, b]).map((i) => i.key);
    expect(new Set(keys).size).toBe(2);
  });
});

describe("buildFacets", () => {
  it("counts providers, models and statuses over requests only", () => {
    const items = groupRecords([
      rec(REQ("0401")), rec(DONE("0401")),
      rec(REQ("0402")), rec(DONE("0402")),
      rec(REQ("0403", { provider: "anthropic", model: "claude-sonnet-4-5" })), rec(ERR("0403", { provider: "anthropic", model: "claude-sonnet-4-5" })),
      rec("[RTK] saved 10B / 20B (50.0%) via [x] hits=1"),
    ]);
    const facets = buildFacets(items);
    expect(facets.providers).toEqual([
      { value: "openai", count: 2 },
      { value: "anthropic", count: 1 },
    ]);
    expect(facets.statuses).toEqual([
      { value: "success", count: 2 },
      { value: "error", count: 1 },
    ]);
    expect(facets.models.map((m) => m.value)).toEqual(["gpt-5", "claude-sonnet-4-5"]);
    expect(facets.tags).toEqual([{ value: "RTK", count: 1 }]);
  });

  it("returns empty facets for an empty buffer", () => {
    expect(buildFacets([])).toEqual({ providers: [], models: [], statuses: [], tags: [] });
  });
});

describe("computeStats", () => {
  it("summarises the buffer window", () => {
    const items = groupRecords([
      rec(REQ("0501"), { at: T0 }), rec(DONE("0501", { ms: 100, ttft: 20, inTok: 1000, outTok: 100 }), { at: T0 + 100 }),
      rec(REQ("0502"), { at: T0 + 1000 }), rec(DONE("0502", { ms: 300, ttft: 60, inTok: 2000, outTok: 300 }), { at: T0 + 1300 }),
      rec(REQ("0503"), { at: T0 + 2000 }), rec(ERR("0503", { ms: 200 }), { at: T0 + 2200 }),
      rec(REQ("0504"), { at: T0 + 3000 }),
    ]);
    const stats = computeStats(items, T0 + 4000);
    expect(stats).toMatchObject({
      total: 4,
      inFlight: 1,
      finished: 3,
      errors: 1,
      reqPerMin: 4,
      inTokens: 3000,
      outTokens: 400,
      systemLines: 0,
    });
    expect(stats.errorRate).toBeCloseTo(1 / 3, 5);
    // Latencies 100/200/300 → p50 is the middle sample.
    expect(stats.p50).toBe(200);
    expect(stats.p95).toBe(290);
    expect(stats.p50Ttft).toBe(40);
  });

  it("counts requests per minute over the last 60s, not the whole buffer", () => {
    const items = groupRecords([
      rec(REQ("0601"), { at: T0 }),                 // 5 minutes old
      rec(REQ("0602"), { at: T0 + 300_000 - 10_000 }), // within the window
    ]);
    const stats = computeStats(items, T0 + 300_000);
    expect(stats.total).toBe(2);
    expect(stats.reqPerMin).toBe(1);
    expect(stats.spanSeconds).toBe(300);
  });

  it("returns null percentiles and a zero error rate on an empty buffer", () => {
    const stats = computeStats([], T0);
    expect(stats).toMatchObject({ total: 0, inFlight: 0, finished: 0, errors: 0, errorRate: 0, spanSeconds: 0 });
    expect(stats.p50).toBeNull();
    expect(stats.p95).toBeNull();
    expect(stats.p50Ttft).toBeNull();
  });

  it("does not let in-flight requests drag the latency percentiles", () => {
    const items = groupRecords([
      rec(REQ("0701"), { at: T0 }), rec(DONE("0701", { ms: 250 }), { at: T0 + 250 }),
      rec(REQ("0702"), { at: T0 + 10 }), // still pending, no totalMs
    ]);
    const stats = computeStats(items, T0 + 500);
    expect(stats.p50).toBe(250);
    expect(stats.errorRate).toBe(0);
  });

  it("counts aborts as errors and sums the cache reads", () => {
    const items = groupRecords([
      rec(REQ("0801")), rec(ABORT("0801")),
      rec(REQ("0802")), rec(`[10:22:05] #0802 🟢 📊 DONE 400ms · IN 900 (CACHE ↻800 +64) · OUT 50`),
    ]);
    const stats = computeStats(items, T0 + 1000);
    expect(stats.errors).toBe(1);
    expect(stats.cacheRead).toBe(800);
  });

  it("counts standalone lines separately from requests", () => {
    const items = groupRecords([rec(REQ("0901")), rec(DONE("0901")), rec("[DB] ready"), rec("[RTK] x")]);
    const stats = computeStats(items, T0);
    expect(stats.total).toBe(1);
    expect(stats.systemLines).toBe(2);
  });
});

describe("filterItems", () => {
  const items = () => groupRecords([
    rec(REQ("1001")), rec(DONE("1001")),
    rec(REQ("1002", { provider: "anthropic", model: "claude-sonnet-4-5" })),
    rec(ERR("1002", { provider: "anthropic", model: "claude-sonnet-4-5", detail: "overloaded_error" })),
    rec("[10:22:04] ℹ️  [HEADROOM] trimmed 120 tokens"),
    rec("[10:22:04] ⚠️  [TOKEN] refresh failed", { level: "warn" }),
  ]);

  it("passes everything through by default", () => {
    expect(filterItems(items(), {})).toHaveLength(4);
  });

  it("filters by provider and excludes standalone rows while a facet is active", () => {
    const out = filterItems(items(), { providers: ["anthropic"] });
    expect(out).toHaveLength(1);
    expect(out[0].reqId).toBe("1002");
  });

  it("filters by status", () => {
    expect(filterItems(items(), { statuses: ["error"] }).map((i) => i.reqId)).toEqual(["1002"]);
  });

  it("filters by model", () => {
    expect(filterItems(items(), { models: ["gpt-5"] }).map((i) => i.reqId)).toEqual(["1001"]);
  });

  it("applies a severity floor to both requests and system lines", () => {
    const out = filterItems(items(), { severity: "warn" });
    // The successful request is info/success; only the failure and the warn line survive.
    expect(out).toHaveLength(2);
    expect(out[0].reqId).toBe("1002");
    expect(out[1].record.tag).toBe("TOKEN");
  });

  it("searches a request's whole group, including its error text", () => {
    const out = filterItems(items(), { query: "overloaded_error" });
    expect(out).toHaveLength(1);
    expect(out[0].reqId).toBe("1002");
  });

  it("matches a request by its id and is case-insensitive", () => {
    expect(filterItems(items(), { query: "1001" }).map((i) => i.reqId)).toEqual(["1001"]);
    expect(filterItems(items(), { query: "ANTHROPIC" }).map((i) => i.reqId)).toEqual(["1002"]);
  });

  it("searches standalone lines by their raw text", () => {
    const out = filterItems(items(), { query: "headroom" });
    expect(out).toHaveLength(1);
    expect(out[0].record.tag).toBe("HEADROOM");
  });

  it("filters standalone lines by kind when asked", () => {
    const out = filterItems(items(), { kinds: ["system"] });
    // Requests are unaffected by the kind filter; only standalone rows are narrowed.
    expect(out.filter((i) => i.type === "system")).toHaveLength(2);
  });

  it("drops every standalone line when showSystem is off", () => {
    // The console's default scope: API calls only.
    const out = filterItems(items(), { showSystem: false });
    expect(out).toHaveLength(2);
    expect(out.every((i) => i.type === "request")).toBe(true);
  });

  it("keeps requests of every outcome when showSystem is off", () => {
    const out = filterItems(items(), { showSystem: false });
    expect(out.map((i) => i.status)).toEqual(["success", "error"]);
  });
});

describe("export helpers", () => {
  const items = () => groupRecords([
    rec("[DB] ready"),
    rec(REQ("1101")), rec(SAVERS("1101")), rec(DONE("1101")),
  ]);

  it("flattens back to records in stream order", () => {
    const records = itemsToRecords(items());
    expect(records).toHaveLength(4);
    expect(records.map((r) => r.seq)).toEqual([...records.map((r) => r.seq)].sort((a, b) => a - b));
  });

  it("reproduces the original bytes in the .log export", () => {
    const source = items();
    const text = toLogText(source);
    // Byte-exact: the terminal and the download must agree.
    for (const record of itemsToRecords(source)) expect(text).toContain(record.text);
    expect(text.split("\n")[0]).toBe("[DB] ready");
  });

  it("writes parsed request summaries into the JSON export", () => {
    const source = items();
    const payload = JSON.parse(toJsonExport(source, computeStats(source, T0)));
    expect(payload.requests).toHaveLength(1);
    expect(payload.requests[0]).toMatchObject({
      reqId: "1101",
      status: "success",
      provider: "openai",
      model: "gpt-5",
      savers: ["CAVEMAN:full", "PXPIPE:2img"],
    });
    expect(payload.requests[0].latency).toEqual({ total: 500, ttft: 100 });
    expect(payload.lines).toHaveLength(4);
    expect(payload.stats.total).toBe(1);
    expect(typeof payload.exportedAt).toBe("string");
  });

  it("produces valid empty output for an empty selection", () => {
    expect(toLogText([])).toBe("");
    const payload = JSON.parse(toJsonExport([], computeStats([], T0)));
    expect(payload.requests).toEqual([]);
    expect(payload.lines).toEqual([]);
  });
});
