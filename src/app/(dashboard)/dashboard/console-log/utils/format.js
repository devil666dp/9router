/** Small formatters shared by the console's toolbar, stream and inspector. */

export function fmtInt(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString();
}

/** Compact token counts: 4123 → "4.1k". Keeps dense rows aligned. */
export function fmtTokens(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const v = Number(n);
  if (v < 1000) return String(v);
  if (v < 1000000) return `${(v / 1000).toFixed(v < 10000 ? 1 : 0)}k`;
  return `${(v / 1000000).toFixed(1)}M`;
}

export function fmtMs(ms) {
  if (ms == null || Number.isNaN(ms)) return "—";
  const v = Number(ms);
  if (v < 1000) return `${v}ms`;
  if (v < 60000) return `${(v / 1000).toFixed(v < 10000 ? 2 : 1)}s`;
  return `${Math.floor(v / 60000)}m ${Math.round((v % 60000) / 1000)}s`;
}

export function fmtPct(ratio) {
  if (ratio == null || Number.isNaN(ratio)) return "—";
  return `${(ratio * 100).toFixed(ratio > 0 && ratio < 0.01 ? 2 : 0)}%`;
}

/** Elapsed wall clock for an in-flight request. */
export function fmtElapsed(startedAt, now = Date.now()) {
  return fmtMs(Math.max(0, now - startedAt));
}

const SEVERITY_META = {
  debug: { label: "Debug", dot: "bg-text-subtle", rail: "border-l-text-subtle/40", text: "text-text-subtle" },
  info: { label: "Info", dot: "bg-info", rail: "border-l-info/40", text: "text-text-main" },
  success: { label: "OK", dot: "bg-success", rail: "border-l-success/50", text: "text-text-main" },
  warn: { label: "Warn", dot: "bg-warning", rail: "border-l-warning/60", text: "text-text-main" },
  error: { label: "Error", dot: "bg-danger", rail: "border-l-danger/70", text: "text-danger" },
};

export function severityMeta(severity) {
  return SEVERITY_META[severity] || SEVERITY_META.info;
}

const STATUS_META = {
  pending: { label: "In flight", variant: "info", icon: "pending" },
  success: { label: "OK", variant: "success", icon: "check_circle" },
  error: { label: "Error", variant: "error", icon: "error" },
  aborted: { label: "Aborted", variant: "warning", icon: "cancel" },
};

export function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.pending;
}

/** Icon per record kind — the stream's leading glyph, replacing raw emoji. */
const KIND_ICONS = {
  request: "play_arrow",
  savers: "tune",
  done: "check_circle",
  error: "error",
  refresh: "key",
  aborted: "cancel",
  http: "input",
  response: "output",
  stream: "waves",
  system: "info",
  text: "chevron_right",
};

export function kindIcon(kind) {
  return KIND_ICONS[kind] || KIND_ICONS.text;
}

/** Trigger a client-side file download without touching the server. */
export function downloadText(filename, text, mime = "text/plain") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick — revoking synchronously can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Timestamp suffix for export filenames: 20260904-142233 */
export function fileStamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}
