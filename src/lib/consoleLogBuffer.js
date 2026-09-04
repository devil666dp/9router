import { EventEmitter } from "events";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config.js";
import { parseConsoleLine } from "@/shared/utils/consoleLogRecord.js";

const consoleLevels = ["log", "info", "warn", "error", "debug"];

if (!global._consoleLogBufferState) {
  global._consoleLogBufferState = {
    logs: [],
    patched: false,
    originals: {},
    emitter: new EventEmitter(),
  };
  global._consoleLogBufferState.emitter.setMaxListeners(50);
}

const state = global._consoleLogBufferState;

// Ensure emitter exists (handles hot reload with stale global)
if (!state.emitter) {
  state.emitter = new EventEmitter();
  state.emitter.setMaxListeners(50);
}

if (!state.pendingLines) state.pendingLines = [];
if (!state.flushTimer) state.flushTimer = null;
if (!state.seq) state.seq = 0;
// Runtime-adjustable cap. Held in module state rather than read per line: appendLine
// runs on every console.* call in the process, so it must never touch the DB.
if (!state.maxLines) state.maxLines = CONSOLE_LOG_CONFIG.maxLines;

const FLUSH_INTERVAL_MS = 100;
const MAX_BATCH_LINES = 50;

function flushPendingLines() {
  state.flushTimer = null;
  if (!state.pendingLines.length) return;

  const lines = state.pendingLines.splice(0, state.pendingLines.length);
  state.emitter.emit("lines", lines);
}

function scheduleFlush() {
  if (state.flushTimer) return;
  state.flushTimer = setTimeout(flushPendingLines, FLUSH_INTERVAL_MS);
  state.flushTimer?.unref?.();
}

// Strip ANSI escape codes so terminal colors don't bleed into UI
const ANSI_RE = /\x1b\[[0-9;]*m/g;

function stripAnsi(str) {
  return str.replace(ANSI_RE, "");
}

function formatArg(arg) {
  if (typeof arg === "string") return stripAnsi(arg);
  if (arg instanceof Error) return stripAnsi(arg.stack || arg.message || String(arg));
  try {
    return stripAnsi(JSON.stringify(arg));
  } catch {
    return stripAnsi(String(arg));
  }
}

/**
 * One console call → one structured record.
 *
 * `level` is the console method that was actually invoked — the only trustworthy
 * severity source, since the printed text carries no level. Parsing happens here,
 * once per line, instead of in each connected browser tab.
 */
function toRecord(level, args) {
  const text = args.map(formatArg).join(" ");
  const record = parseConsoleLine(level, text);
  record.seq = ++state.seq;
  record.at = Date.now();
  return record;
}

function appendRecord(record) {
  state.logs.push(record);
  if (state.logs.length > state.maxLines) {
    state.logs = state.logs.slice(-state.maxLines);
  }
  state.pendingLines.push(record);
  if (state.pendingLines.length >= MAX_BATCH_LINES) {
    if (state.flushTimer) {
      clearTimeout(state.flushTimer);
      state.flushTimer = null;
    }
    flushPendingLines();
  } else {
    scheduleFlush();
  }
}

export function initConsoleLogCapture() {
  if (state.patched) return;

  for (const level of consoleLevels) {
    state.originals[level] = console[level];
    console[level] = (...args) => {
      // A throw here would break every caller of console.*, so fail open.
      try { appendRecord(toRecord(level, args)); } catch { /* capture is best-effort */ }
      state.originals[level](...args);
    };
  }

  state.patched = true;
}

/** Buffered records, oldest first. */
export function getConsoleLogs() {
  return state.logs;
}

/** Buffered records as the raw formatted strings, for the console's raw view and .log export. */
export function getConsoleLogLines() {
  return state.logs.map((r) => r.text);
}

export function clearConsoleLogs() {
  state.logs = [];
  // Drop anything still queued for the next flush. Without this, lines captured before
  // the clear would arrive at viewers that have already reset, resurrecting them.
  state.pendingLines.length = 0;
  if (state.flushTimer) {
    clearTimeout(state.flushTimer);
    state.flushTimer = null;
  }
  state.emitter.emit("clear");
}

export function getConsoleEmitter() {
  return state.emitter;
}

/** Current ring-buffer capacity in lines. */
export function getConsoleBufferMax() {
  return state.maxLines;
}

/**
 * Resize the ring buffer. Applied immediately, trimming oldest lines when shrinking.
 * Callers (the settings route) own persistence; this only moves the in-process cap.
 */
export function setConsoleBufferMax(maxLines) {
  const next = Math.max(50, Math.min(20000, Number(maxLines) || 0));
  state.maxLines = next;
  if (state.logs.length > next) state.logs = state.logs.slice(-next);
  return next;
}
