/**
 * Turning a flat console record stream into request groups, facets and stats.
 *
 * Pure functions over the records produced by src/shared/utils/consoleLogRecord.js —
 * no DOM, no fetch, no DB. The console viewer's list, inspector, facet lists and
 * stats strip are all derived from here, so they can never disagree with each other.
 */

import { LIFECYCLE_KINDS, TERMINAL_KINDS, meetsSeverity } from "@/shared/utils/consoleLogRecord.js";

/** Rows that are not part of any request group render as standalone system entries. */
const SYSTEM_GROUP = "system";

/**
 * Group records by request id.
 *
 * A group is created by any lifecycle line carrying a reqId. Records without one — or
 * non-lifecycle records — stay standalone, in stream order, so nothing is hidden.
 * Out-of-order arrival is tolerated: a `📊 done` seen before its `▶ request` still
 * lands in the right group, and the group's fields are merged from whatever arrived.
 */
export function groupRecords(records) {
  const groups = new Map();
  const items = [];

  for (const record of records) {
    const isLifecycle = LIFECYCLE_KINDS.has(record.kind);
    if (!isLifecycle || !record.reqId) {
      // `seq` restarts at 1 when the server process restarts, so a buffer spanning a
      // restart can hold two records with the same seq. Key on the arrival index too —
      // it is unique within one render pass, which is all a React key must be.
      items.push({ type: SYSTEM_GROUP, key: `s${record.seq}-${items.length}`, record });
      continue;
    }

    let group = groups.get(record.reqId);
    if (!group) {
      group = {
        type: "request",
        key: `r${record.reqId}`,
        reqId: record.reqId,
        dot: record.dot,
        firstSeq: record.seq,
        lastSeq: record.seq,
        startedAt: record.at,
        endedAt: null,
        time: record.time,
        provider: "",
        model: "",
        clientModel: "",
        account: "",
        stream: null,
        sourceFormat: "",
        targetFormat: "",
        passthrough: false,
        messages: 0,
        tools: 0,
        thinking: "",
        savers: [],
        status: "pending",
        statusCode: null,
        errorText: "",
        errorUrl: "",
        totalMs: null,
        ttftMs: null,
        inTokens: null,
        outTokens: null,
        cacheRead: null,
        cacheCreate: null,
        refreshed: false,
        severity: "info",
        records: [],
      };
      groups.set(record.reqId, group);
      items.push(group);
    }

    group.records.push(record);
    if (record.seq < group.firstSeq) { group.firstSeq = record.seq; group.time = record.time; }
    if (record.seq > group.lastSeq) group.lastSeq = record.seq;
    if (record.at < group.startedAt) group.startedAt = record.at;
    if (!group.dot && record.dot) group.dot = record.dot;

    applyRecordToGroup(group, record);
  }

  return items;
}

/** Fold one lifecycle record's parsed fields into its group. */
function applyRecordToGroup(group, record) {
  const f = record.fields || {};

  if (f.provider && !group.provider) group.provider = f.provider;
  if (f.model && !group.model) group.model = f.model;

  switch (record.kind) {
    case "request":
      group.clientModel = f.clientModel || group.clientModel;
      group.stream = f.stream ?? group.stream;
      group.sourceFormat = f.sourceFormat || group.sourceFormat;
      group.targetFormat = f.targetFormat || group.targetFormat;
      group.passthrough = f.passthrough ?? group.passthrough;
      group.messages = f.messages ?? group.messages;
      group.tools = f.tools ?? group.tools;
      group.thinking = f.thinking || group.thinking;
      group.account = f.account || group.account;
      break;
    case "savers":
      if (Array.isArray(f.savers)) group.savers = [...group.savers, ...f.savers];
      break;
    case "refresh":
      group.refreshed = true;
      break;
    case "done":
      group.status = "success";
      group.severity = "success";
      group.endedAt = record.at;
      group.totalMs = f.totalMs ?? group.totalMs;
      group.ttftMs = f.ttftMs ?? group.ttftMs;
      group.inTokens = f.inTokens ?? group.inTokens;
      group.outTokens = f.outTokens ?? group.outTokens;
      group.cacheRead = f.cacheRead ?? group.cacheRead;
      group.cacheCreate = f.cacheCreate ?? group.cacheCreate;
      break;
    case "aborted":
      // An abort after a successful completion is just the client closing the socket
      // (codex/droid do this on every request) — never downgrade a finished request.
      if (group.status === "pending") {
        group.status = "aborted";
        group.severity = "error";
        group.endedAt = record.at;
        group.totalMs = f.latencyMs ?? group.totalMs;
      }
      break;
    case "error":
      group.status = "error";
      group.severity = "error";
      group.endedAt = record.at;
      group.statusCode = f.status ?? group.statusCode;
      group.totalMs = f.latencyMs ?? group.totalMs;
      if (f.detail) group.errorText = f.detail;
      if (f.url) group.errorUrl = f.url;
      break;
    default:
      break;
  }
}

/** A group still awaiting a terminal line is in flight. */
export function isInFlight(group) {
  return group.type === "request" && group.status === "pending";
}

export { TERMINAL_KINDS };

// ── Facets ──────────────────────────────────────────────────────────────────

/**
 * Facet values present in the current buffer, with counts.
 *
 * Derived from what actually arrived rather than from a static list, so the filter
 * lists stay short and every option matches at least one row.
 */
export function buildFacets(items) {
  const providers = new Map();
  const models = new Map();
  const statuses = new Map();
  const tags = new Map();

  const bump = (map, key) => { if (key) map.set(key, (map.get(key) || 0) + 1); };

  for (const item of items) {
    if (item.type === "request") {
      bump(providers, item.provider);
      bump(models, item.model);
      bump(statuses, item.status);
    } else {
      bump(tags, item.record.tag);
    }
  }

  const toSorted = (map) =>
    [...map.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  return { providers: toSorted(providers), models: toSorted(models), statuses: toSorted(statuses), tags: toSorted(tags) };
}

// ── Stats ───────────────────────────────────────────────────────────────────

function percentile(sorted, p) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low];
  return Math.round(sorted[low] + (sorted[high] - sorted[low]) * (rank - low));
}

/**
 * Stats over the buffer window only — not all-time. The Usage page owns global
 * numbers; conflating the two would misreport both.
 *
 * @param {Array} items groups from groupRecords()
 * @param {number} now  clock, injectable for tests
 */
export function computeStats(items, now = Date.now()) {
  const requests = items.filter((i) => i.type === "request");
  const finished = requests.filter((r) => r.status !== "pending");
  const errors = requests.filter((r) => r.status === "error" || r.status === "aborted");

  const latencies = finished.map((r) => r.totalMs).filter((n) => typeof n === "number" && n >= 0).sort((a, b) => a - b);
  const ttfts = finished.map((r) => r.ttftMs).filter((n) => typeof n === "number" && n > 0).sort((a, b) => a - b);

  let inTokens = 0;
  let outTokens = 0;
  let cacheRead = 0;
  for (const r of requests) {
    inTokens += r.inTokens || 0;
    outTokens += r.outTokens || 0;
    cacheRead += r.cacheRead || 0;
  }

  // Rate over the last minute of wall clock, so it reflects "now" rather than the
  // whole buffer (which may span hours on a quiet install).
  const cutoff = now - 60000;
  const lastMinute = requests.filter((r) => r.startedAt >= cutoff).length;

  const span = requests.length
    ? Math.max(1, (now - Math.min(...requests.map((r) => r.startedAt))) / 1000)
    : 0;

  return {
    total: requests.length,
    inFlight: requests.filter(isInFlight).length,
    finished: finished.length,
    errors: errors.length,
    errorRate: finished.length ? errors.length / finished.length : 0,
    reqPerMin: lastMinute,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p50Ttft: percentile(ttfts, 50),
    inTokens,
    outTokens,
    cacheRead,
    spanSeconds: Math.round(span),
    systemLines: items.length - requests.length,
  };
}

// ── Filtering ───────────────────────────────────────────────────────────────

function groupHaystack(group) {
  return [
    group.reqId, group.provider, group.model, group.clientModel, group.account,
    group.status, group.statusCode, group.sourceFormat, group.targetFormat,
    group.savers.join(" "), group.errorText, group.errorUrl,
    ...group.records.map((r) => r.text),
  ].filter(Boolean).join(" ").toLowerCase();
}

/**
 * Apply the toolbar's filters to grouped items.
 *
 * A request group matches when the group itself matches — searching the whole group's
 * text, so typing an error message still surfaces the request that produced it.
 */
export function filterItems(items, filters = {}) {
  const {
    query = "", severity = "debug", providers = [], models = [], statuses = [],
    kinds = null, showSystem = true,
  } = filters;
  const q = query.trim().toLowerCase();

  return items.filter((item) => {
    if (item.type === "request") {
      if (providers.length && !providers.includes(item.provider)) return false;
      if (models.length && !models.includes(item.model)) return false;
      if (statuses.length && !statuses.includes(item.status)) return false;
      if (!meetsSeverity(item.severity, severity)) return false;
      if (q && !groupHaystack(item).includes(q)) return false;
      return true;
    }

    // Standalone system row: anything the gateway printed that isn't part of a request.
    // Hidden by default — the console exists to watch API calls — and excluded outright
    // whenever a request-scoped facet is active, since "only anthropic" shouldn't leave
    // unrelated noise in the list.
    if (!showSystem) return false;
    if (providers.length || models.length || statuses.length) return false;
    const record = item.record;
    if (!meetsSeverity(record.severity, severity)) return false;
    if (kinds && kinds.length && !kinds.includes(record.kind)) return false;
    if (q && !record.text.toLowerCase().includes(q)) return false;
    return true;
  });
}

// ── Export helpers ──────────────────────────────────────────────────────────

/** Records behind a filtered item list, in stream order — the basis of both exports. */
export function itemsToRecords(items) {
  const out = [];
  for (const item of items) {
    if (item.type === "request") out.push(...item.records);
    else out.push(item.record);
  }
  return out.sort((a, b) => a.seq - b.seq);
}

/** Exact original bytes, for a .log download or a "copy group" that matches the terminal. */
export function toLogText(items) {
  return itemsToRecords(items).map((r) => r.text).join("\n");
}

/** Structured export: the parsed records plus the derived request summaries. */
export function toJsonExport(items, stats) {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    stats,
    requests: items.filter((i) => i.type === "request").map((g) => ({
      reqId: g.reqId,
      status: g.status,
      statusCode: g.statusCode,
      provider: g.provider,
      model: g.model,
      clientModel: g.clientModel,
      account: g.account,
      stream: g.stream,
      formats: { source: g.sourceFormat, target: g.targetFormat, passthrough: g.passthrough },
      messages: g.messages,
      tools: g.tools,
      thinking: g.thinking || null,
      savers: g.savers,
      refreshed: g.refreshed,
      latency: { total: g.totalMs, ttft: g.ttftMs },
      tokens: { in: g.inTokens, out: g.outTokens, cacheRead: g.cacheRead, cacheCreate: g.cacheCreate },
      error: g.errorText || null,
      errorUrl: g.errorUrl || null,
      lines: g.records.map((r) => r.text),
    })),
    lines: itemsToRecords(items),
  }, null, 2);
}
