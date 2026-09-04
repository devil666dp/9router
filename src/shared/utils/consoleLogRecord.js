/**
 * Parsing captured console output into structured records.
 *
 * The gateway prints correlated request lines through src/sse/utils/logger.js plus
 * bare `console.log` from a few subsystems ([RTK], [DB], [HEADROOM]). The console
 * viewer needs level, request identity and per-kind fields to group and filter, so
 * every captured line is parsed once, server-side, at capture time.
 *
 * Pure and total: an unrecognised line still yields a usable record whose `text` is
 * the original string.
 */

// Symbols emitted by logger.line()/errorLine() — see open-sse/handlers/chatCore.js
// and open-sse/utils/streamHandler.js. Each marks one request lifecycle stage.
export const SYMBOL_KINDS = {
  "▶": "request",
  "⚙": "savers",
  "📊": "done",
  "✗": "error",
  "🔑": "refresh",
  "⚡": "aborted",
};

// Icons emitted by logger.debug/info/warn/error/request/response/stream.
const ICON_KINDS = {
  "🔍": { kind: "system", severity: "debug" },
  "ℹ️": { kind: "system", severity: "info" },
  "⚠️": { kind: "system", severity: "warn" },
  "❌": { kind: "system", severity: "error" },
  "📥": { kind: "http", severity: "info" },
  "📤": { kind: "response", severity: "info" },
  "💥": { kind: "response", severity: "error" },
  "🌊": { kind: "stream", severity: "debug" },
};

// Colored dots from logger.REQ_TAGS — correlate the lines of one CLI session.
const DOT_RE = /^(🟢|🔵|🟣|🟡|🟠|🔴|⚪|🟤)/u;

const TIME_RE = /^\[(\d{1,2}:\d{2}:\d{2})\]\s*/;
const REQID_RE = /^#([0-9a-z]{2,8})\s+/i;
const BRACKET_TAG_RE = /^\[([A-Z0-9_.-]+)\]\s*/i;

// Severity ordering, so a level filter can mean "warn and above".
export const SEVERITIES = ["debug", "info", "success", "warn", "error"];

const LEVEL_SEVERITY = { debug: "debug", log: "info", info: "info", warn: "warn", error: "error" };

/** Kinds that belong to one upstream request rather than an ambient message. */
export const LIFECYCLE_KINDS = new Set(["request", "savers", "done", "error", "refresh", "aborted"]);

/** Kinds that end a request's lifecycle. */
export const TERMINAL_KINDS = new Set(["done", "error", "aborted"]);

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** "4.1k" / "812" → number. The done line prints raw integers, but stay tolerant. */
function tokenNum(value) {
  if (value == null) return 0;
  const s = String(value).trim().toLowerCase();
  if (s.endsWith("k")) return Math.round(parseFloat(s) * 1000) || 0;
  if (s.endsWith("m")) return Math.round(parseFloat(s) * 1e6) || 0;
  return num(s);
}

// ── Per-kind field extraction ───────────────────────────────────────────────

// "POST claude-sonnet-4 → anthropic/claude-3-5 · FMT: claude→openai · STREAM · 12 MSG · 3 TOOL · THINK:10k · ACC:main"
// The arrow is omitted when the client asked for exactly the route it resolved to:
// "POST anthropic/claude-3-5 · FMT: …".
function parseRequestFields(message) {
  const fields = {};
  const parts = message.split(" · ").map((p) => p.trim());

  const head = parts.shift() || "";
  const headMatch = head.match(/^POST\s+(.+?)\s*(?:→|->)\s*([^/\s]+)\/(.+)$/);
  if (headMatch) {
    fields.clientModel = headMatch[1].trim();
    fields.provider = headMatch[2].trim();
    fields.model = headMatch[3].trim();
  } else {
    const route = head.replace(/^POST\s+/, "").trim();
    fields.clientModel = route;
    const pm = route.match(/^([^/\s]+)\/(.+)$/);
    if (pm) { fields.provider = pm[1].trim(); fields.model = pm[2].trim(); }
  }

  for (const part of parts) {
    const fmt = part.match(/^FMT:\s*(.+)$/i);
    if (fmt) {
      const value = fmt[1].trim();
      const pass = value.match(/^(\S+)\s*\(passthrough\)$/i);
      if (pass) {
        fields.sourceFormat = pass[1];
        fields.targetFormat = pass[1];
        fields.passthrough = true;
      } else {
        const pair = value.split(/→|->/).map((s) => s.trim());
        fields.sourceFormat = pair[0] || "";
        fields.targetFormat = pair[1] || pair[0] || "";
        fields.passthrough = false;
      }
      continue;
    }
    if (part === "STREAM" || part === "JSON") { fields.stream = part === "STREAM"; continue; }
    const msg = part.match(/^(\d+)\s+MSG$/i);
    if (msg) { fields.messages = num(msg[1]); continue; }
    const tool = part.match(/^(\d+)\s+TOOL$/i);
    if (tool) { fields.tools = num(tool[1]); continue; }
    const think = part.match(/^THINK:(.+)$/i);
    if (think) { fields.thinking = think[1].trim(); continue; }
    const acc = part.match(/^ACC:(.+)$/i);
    if (acc) { fields.account = acc[1].trim(); }
  }
  return fields;
}

// "DONE 812ms · TTFT 240ms · IN 4100 (CACHE ↻2000 +512) · OUT 380"
function parseDoneFields(message) {
  const fields = {};
  const total = message.match(/^DONE\s+(\d+)ms/i);
  if (total) fields.totalMs = num(total[1]);
  const ttft = message.match(/TTFT\s+(\d+)ms/i);
  if (ttft) fields.ttftMs = num(ttft[1]);
  const inTok = message.match(/\bIN\s+([\d.]+[km]?)/i);
  if (inTok) fields.inTokens = tokenNum(inTok[1]);
  const outTok = message.match(/\bOUT\s+([\d.]+[km]?)/i);
  if (outTok) fields.outTokens = tokenNum(outTok[1]);
  const cacheRead = message.match(/↻\s*([\d.]+[km]?)/i);
  if (cacheRead) fields.cacheRead = tokenNum(cacheRead[1]);
  const cacheCreate = message.match(/\+\s*([\d.]+[km]?)(?=[\s)])/);
  if (cacheCreate) fields.cacheCreate = tokenNum(cacheCreate[1]);
  return fields;
}

// streamHandler.js appends " · provider/model · Nms" to whatever status string it was
// given, so an error carrying a stack trace pushes the route and duration onto the LAST
// line. Peel that tail off first so both shapes yield the same fields.
const ERROR_TAIL_RE = /\s·\s([a-z0-9_.-]+)\/([^\s·]+)\s·\s(\d+)ms\s*$/i;

// "ERROR 429 · anthropic/claude-3-5 · 812ms\n    URL: https://…\n    rate limited"
// Also covers "BLOCKED 400 · …" and streamHandler's "ABORTED · provider/model · 120ms".
function parseErrorFields(message) {
  const fields = {};

  let body = message;
  const tail = body.match(ERROR_TAIL_RE);
  if (tail) body = body.slice(0, tail.index);

  const lines = body.split("\n");
  const parts = (lines[0] || "").split(" · ").map((p) => p.trim());

  const status = parts[0]?.match(/^(?:ERROR|BLOCKED|FAILED)\s+(\d{3})/i);
  if (status) fields.status = num(status[1]);
  else if (/^ABORTED/i.test(parts[0] || "")) fields.aborted = true;

  for (const part of parts.slice(1)) {
    const ms = part.match(/^(\d+)ms$/i);
    if (ms) { fields.latencyMs = num(ms[1]); continue; }
    const pm = part.match(/^([^/\s]+)\/(.+)$/);
    if (pm && !fields.provider) { fields.provider = pm[1]; fields.model = pm[2]; }
  }

  const detail = [];
  for (const raw of lines.slice(1)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const url = trimmed.match(/^URL:\s*(.+)$/i);
    if (url) { fields.url = url[1].trim(); continue; }
    detail.push(trimmed);
  }
  if (detail.length) fields.detail = detail.join("\n");

  if (tail) {
    if (!fields.provider) { fields.provider = tail[1]; fields.model = tail[2]; }
    if (fields.latencyMs == null) fields.latencyMs = num(tail[3]);
  }
  return fields;
}

// "CAVEMAN:full · PONYTAIL:2 · PXPIPE:3img"
function parseSaverFields(message) {
  return { savers: message.split(" · ").map((s) => s.trim()).filter(Boolean) };
}

// "TOKEN REFRESHED · provider/model", and streamHandler's status lines.
function parseProviderModel(message) {
  const fields = {};
  for (const part of message.split(" · ").map((p) => p.trim())) {
    const pm = part.match(/^([a-z0-9_-]+)\/(.+)$/i);
    if (pm && !fields.provider) { fields.provider = pm[1]; fields.model = pm[2]; }
    const ms = part.match(/^(\d+)ms$/i);
    if (ms) fields.latencyMs = num(ms[1]);
  }
  return fields;
}

// "200 (812ms) {...}" from logger.response()
function parseResponseFields(message) {
  const fields = {};
  const m = message.match(/^(\d{3})\s*\((\d+)ms\)/);
  if (m) { fields.status = num(m[1]); fields.latencyMs = num(m[2]); }
  return fields;
}

// "POST /v1/chat/completions {...}" from logger.request()
function parseHttpFields(message) {
  const fields = {};
  const m = message.match(/^([A-Z]+)\s+(\S+)/);
  if (m) { fields.method = m[1]; fields.path = m[2]; }
  return fields;
}

function fieldsFor(kind, message) {
  switch (kind) {
    case "request": return parseRequestFields(message);
    case "done": return parseDoneFields(message);
    case "error": return parseErrorFields(message);
    case "savers": return parseSaverFields(message);
    case "refresh": return parseProviderModel(message);
    // ABORTED carries no status code, but shares the "· provider/model · Nms" tail.
    case "aborted": return parseErrorFields(message);
    case "response": return parseResponseFields(message);
    case "http": return parseHttpFields(message);
    default: return {};
  }
}

/** A lifecycle symbol implies its own severity, whichever console method printed it. */
function severityForKind(kind, level) {
  if (kind === "error" || kind === "aborted") return "error";
  if (kind === "done") return "success";
  if (kind === "request" || kind === "savers" || kind === "refresh") return "info";
  return LEVEL_SEVERITY[level] || "info";
}

/**
 * One captured console line → one structured record.
 *
 * @param {string} level the console method actually called ("log"|"info"|"warn"|"error"|"debug").
 *   This is the only trustworthy severity source — the printed text does not carry it, which is
 *   why the previous UI's level colouring never worked.
 * @param {string} text the formatted, ANSI-stripped line.
 */
export function parseConsoleLine(level, text) {
  const raw = typeof text === "string" ? text : String(text ?? "");
  const record = {
    level: LEVEL_SEVERITY[level] ? level : "log",
    severity: LEVEL_SEVERITY[level] || "info",
    kind: "text",
    time: "",
    reqId: "",
    dot: "",
    symbol: "",
    tag: "",
    message: raw,
    text: raw,
    fields: {},
  };

  let rest = raw;

  const time = rest.match(TIME_RE);
  if (time) { record.time = time[1]; rest = rest.slice(time[0].length); }

  const reqId = rest.match(REQID_RE);
  if (reqId) { record.reqId = reqId[1]; rest = rest.slice(reqId[0].length); }

  const dot = rest.match(DOT_RE);
  if (dot) { record.dot = dot[1]; rest = rest.slice(dot[0].length).replace(/^\s+/, ""); }

  // Lifecycle symbol (▶ ⚙ 📊 ✗ 🔑 ⚡) sits directly after the dot.
  const symbol = Object.keys(SYMBOL_KINDS).find((s) => rest.startsWith(s));
  if (symbol) {
    record.symbol = symbol;
    record.kind = SYMBOL_KINDS[symbol];
    record.severity = severityForKind(record.kind, record.level);
    rest = rest.slice(symbol.length).replace(/^\s+/, "");
  } else {
    // Icon family — logger.debug/info/warn/error/request/response/stream.
    const icon = Object.keys(ICON_KINDS).find((i) => rest.startsWith(i));
    if (icon) {
      record.symbol = icon;
      record.kind = ICON_KINDS[icon].kind;
      record.severity = ICON_KINDS[icon].severity;
      // The warn/info icons are emitted with a trailing variation selector + padding.
      rest = rest.slice(icon.length).replace(/^[️\s]+/, "");
    }
  }

  // Subsystem tag: "[AUTH] …" from the icon family, or a bare "[RTK] …" console.log.
  const tag = rest.match(BRACKET_TAG_RE);
  if (tag) {
    record.tag = tag[1].toUpperCase();
    rest = rest.slice(tag[0].length);
    if (record.kind === "text") record.kind = "system";
  }

  // An explicit console.error/warn outranks a benign-looking kind.
  if (record.level === "error" && record.severity !== "error") record.severity = "error";
  else if (record.level === "warn" && record.severity === "info") record.severity = "warn";

  record.message = rest;
  record.fields = fieldsFor(record.kind, rest);
  return record;
}

/** True when `severity` is at or above `min` in SEVERITIES order. */
export function meetsSeverity(severity, min) {
  const a = SEVERITIES.indexOf(severity);
  const b = SEVERITIES.indexOf(min);
  if (a < 0 || b < 0) return true;
  return a >= b;
}
