// Logger utility for cloud

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const LEVEL = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase?.()] ?? LOG_LEVELS.INFO;

function formatTime() {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

// Colored-dot tags to correlate request lines by session (same session → same color)
const REQ_TAGS = ["🟢", "🔵", "🟣", "🟡", "🟠", "🔴", "⚪", "🟤"];
let tagCursor = 0;

// Allocate next rotating tag (fallback when no session seed available)
export function nextTag() {
  const tag = REQ_TAGS[tagCursor % REQ_TAGS.length];
  tagCursor++;
  return tag;
}

// Stable tag derived from a session/connection seed: same seed always maps to the same color
export function tagForSession(seed) {
  if (!seed) return nextTag();
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return REQ_TAGS[Math.abs(h) % REQ_TAGS.length];
}

// Per-request id, unique within one process run. Only 8 session dots exist, so two
// concurrent requests on the same provider share one — the id is what actually groups
// a request's lifecycle lines (▶ ⚙ 📊 ✗ 🔑) in the console viewer.
//
// A monotonic counter, not random: collision-free within any log window, and its
// ordering is readable. Base36 keeps it 4 chars up to ~1.6M requests, then grows.
let reqIdCursor = Math.floor(Math.random() * 1296); // 36^2 — avoid every restart starting at #0000
export function nextReqId() {
  reqIdCursor = (reqIdCursor + 1) % 1679616; // 36^4
  return reqIdCursor.toString(36).padStart(4, "0");
}

// Print one correlated line: [time] #id tag symbol message
export function line(tag, symbol, message, reqId) {
  if (LEVEL > LOG_LEVELS.INFO) return;
  console.log(`[${formatTime()}]${reqId ? ` #${reqId}` : ""} ${tag} ${symbol} ${message}`);
}

// Like line() but always printed regardless of LOG_LEVEL (errors must never be hidden)
export function errorLine(tag, symbol, message, reqId) {
  console.log(`[${formatTime()}]${reqId ? ` #${reqId}` : ""} ${tag} ${symbol} ${message}`);
}

// Format thinking intent for the request line ("high(10k)" / "off" / "auto")
export function fmtThink(intent) {
  if (!intent || !intent.mode) return null;
  if (intent.mode === "none") return "off";
  if (intent.mode === "auto") return "auto";
  if (intent.mode === "budget") {
    const k = intent.budget >= 1000 ? `${Math.round(intent.budget / 1000)}k` : `${intent.budget}`;
    return k;
  }
  if (intent.mode === "level") return intent.level;
  return null;
}

function formatData(data) {
  if (!data) return "";
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

export function debug(tag, message, data) {
  if (LEVEL <= LOG_LEVELS.DEBUG) {
    const dataStr = data ? ` ${formatData(data)}` : "";
    console.log(`[${formatTime()}] 🔍 [${tag}] ${message}${dataStr}`);
  }
}

export function info(tag, message, data) {
  if (LEVEL <= LOG_LEVELS.INFO) {
    const dataStr = data ? ` ${formatData(data)}` : "";
    console.log(`[${formatTime()}] ℹ️  [${tag}] ${message}${dataStr}`);
  }
}

export function warn(tag, message, data) {
  if (LEVEL <= LOG_LEVELS.WARN) {
    const dataStr = data ? ` ${formatData(data)}` : "";
    console.warn(`[${formatTime()}] ⚠️  [${tag}] ${message}${dataStr}`);
  }
}

export function error(tag, message, data) {
  if (LEVEL <= LOG_LEVELS.ERROR) {
    const dataStr = data ? ` ${formatData(data)}` : "";
    console.log(`[${formatTime()}] ❌ [${tag}] ${message}${dataStr}`);
  }
}

export function request(method, path, extra) {
  const dataStr = extra ? ` ${formatData(extra)}` : "";
  console.log(`\x1b[36m[${formatTime()}] 📥 ${method} ${path}${dataStr}\x1b[0m`);
}

export function response(status, duration, extra) {
  const icon = status < 400 ? "📤" : "💥";
  const dataStr = extra ? ` ${formatData(extra)}` : "";
  console.log(`[${formatTime()}] ${icon} ${status} (${duration}ms)${dataStr}`);
}

export function stream(event, data) {
  const dataStr = data ? ` ${formatData(data)}` : "";
  console.log(`[${formatTime()}] 🌊 [STREAM] ${event}${dataStr}`);
}

// Mask sensitive data
export function maskKey(key) {
  if (!key || key.length < 8) return "***";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
