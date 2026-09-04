"use client";

import { useState } from "react";
import { cn } from "@/shared/utils/cn";
import Tooltip from "@/shared/components/Tooltip";
import { fmtElapsed, fmtMs, fmtTokens, kindIcon, severityMeta, statusMeta } from "../utils/format";

function Row({ label, children, mono = true }) {
  if (children == null || children === "" || children === false) return null;
  return (
    <div className="flex items-baseline gap-3 py-1">
      <span className="shrink-0 w-[74px] text-[10px] font-semibold uppercase tracking-wider text-text-subtle">
        {label}
      </span>
      <span className={cn("min-w-0 flex-1 text-xs text-text-main break-words", mono && "font-mono")}>
        {children}
      </span>
    </div>
  );
}

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border-subtle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-left hover:bg-surface-2/60 transition-colors"
      >
        <span className={cn("material-symbols-outlined text-[15px] text-text-subtle transition-transform", open && "rotate-90")}>
          chevron_right
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{title}</span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip text={copied ? "Copied" : label} position="left">
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          } catch { /* clipboard blocked — nothing useful to say */ }
        }}
        aria-label={label}
        className="inline-flex items-center justify-center size-7 rounded-[8px] text-text-subtle hover:text-text-main hover:bg-surface-2 transition-colors"
      >
        <span className="material-symbols-outlined text-[15px]">{copied ? "check" : "content_copy"}</span>
      </button>
    </Tooltip>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 h-full p-6 text-center">
      <span className="material-symbols-outlined text-[28px] text-text-subtle/60">frame_inspect</span>
      <p className="text-sm font-medium text-text-main">No requests yet</p>
      <p className="text-xs text-text-subtle max-w-[220px]">
        Send a request through the gateway and its full lifecycle, parsed fields and raw
        lines appear here.
      </p>
      <p className="text-[10px] text-text-subtle/80 mt-2">
        <kbd className="px-1 py-0.5 rounded bg-surface-2 font-mono">j</kbd>
        {" / "}
        <kbd className="px-1 py-0.5 rounded bg-surface-2 font-mono">k</kbd>
        {" to move · "}
        <kbd className="px-1 py-0.5 rounded bg-surface-2 font-mono">/</kbd>
        {" to search"}
      </p>
    </div>
  );
}

/** A standalone system line — no request context to show, so keep it plain. */
function SystemInspector({ record }) {
  const meta = severityMeta(record.severity);
  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border-subtle">
        <span className={cn("size-2 rounded-full shrink-0", meta.dot)} />
        <span className="text-xs font-semibold text-text-main">{record.tag || meta.label}</span>
        <span className="ml-auto font-mono text-[11px] text-text-subtle tabular-nums">{record.time}</span>
        <CopyButton text={record.text} label="Copy line" />
      </div>

      <div className="px-3 py-2">
        <Row label="Level">{meta.label}</Row>
        <Row label="Source">{record.kind}</Row>
        {record.fields?.method && <Row label="Request">{`${record.fields.method} ${record.fields.path}`}</Row>}
        {record.fields?.status != null && <Row label="Status">{record.fields.status}</Row>}
      </div>

      <Section title="Raw line">
        <pre className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-words text-text-muted bg-surface-2 rounded-[9px] p-2.5">
          {record.text}
        </pre>
      </Section>
    </>
  );
}

function RequestDetail({ group, observabilityEnabled }) {
  const status = statusMeta(group.status);
  const meta = severityMeta(group.severity);
  const inFlight = group.status === "pending";
  const groupText = group.records.map((r) => r.text).join("\n");

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border-subtle">
        <span className={cn("size-2 rounded-full shrink-0", meta.dot, inFlight && "animate-pulse")} />
        <span className="font-mono text-xs font-semibold text-brand-600 dark:text-brand-400">#{group.reqId}</span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
            group.status === "success" && "bg-success/10 text-success",
            group.status === "error" && "bg-danger/10 text-danger",
            group.status === "aborted" && "bg-warning/10 text-warning",
            inFlight && "bg-info/10 text-info"
          )}
        >
          <span className="material-symbols-outlined text-[12px]">{status.icon}</span>
          {group.statusCode ? `${status.label} ${group.statusCode}` : status.label}
        </span>
        <span className="ml-auto font-mono text-[11px] text-text-subtle tabular-nums">{group.time}</span>
        <CopyButton text={groupText} label="Copy this request" />
      </div>

      <div className="px-3 py-2">
        <Row label="Route">
          {group.provider ? (
            <span>
              {group.provider}
              <span className="text-text-subtle">/</span>
              {group.model}
            </span>
          ) : "—"}
        </Row>
        <Row label="Client">{group.clientModel || "—"}</Row>
        <Row label="Format">
          {group.sourceFormat
            ? group.passthrough
              ? `${group.sourceFormat} (passthrough)`
              : `${group.sourceFormat} → ${group.targetFormat}`
            : "—"}
        </Row>
        <Row label="Mode">{group.stream == null ? "—" : group.stream ? "streaming" : "json"}</Row>
        <Row label="Account">{group.account || "—"}</Row>
        <Row label="Latency">
          {inFlight ? (
            <span className="text-info">{fmtElapsed(group.startedAt)} elapsed</span>
          ) : (
            <span>
              {fmtMs(group.totalMs)}
              {group.ttftMs ? <span className="text-text-subtle"> · TTFT {fmtMs(group.ttftMs)}</span> : null}
            </span>
          )}
        </Row>
        <Row label="Tokens">
          {group.inTokens != null || group.outTokens != null ? (
            <span>
              {fmtTokens(group.inTokens)} in <span className="text-text-subtle">/</span> {fmtTokens(group.outTokens)} out
              {group.cacheRead ? <span className="text-text-subtle"> · {fmtTokens(group.cacheRead)} cached</span> : null}
              {group.cacheCreate ? <span className="text-text-subtle"> · +{fmtTokens(group.cacheCreate)} written</span> : null}
            </span>
          ) : "—"}
        </Row>
        <Row label="Payload">
          {group.messages || group.tools
            ? `${group.messages} msg${group.tools ? ` · ${group.tools} tools` : ""}${group.thinking ? ` · think ${group.thinking}` : ""}`
            : "—"}
        </Row>
        {group.savers.length > 0 && <Row label="Savers">{group.savers.join(" · ")}</Row>}
        {group.refreshed && <Row label="Auth">credentials refreshed mid-request</Row>}
      </div>

      {(group.errorText || group.errorUrl) && (
        <Section title="Failure">
          {group.errorUrl && (
            <p className="mb-2 font-mono text-[11px] text-text-muted break-all">{group.errorUrl}</p>
          )}
          {group.errorText && (
            <pre className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-words text-danger bg-danger/[0.06] rounded-[9px] p-2.5">
              {group.errorText}
            </pre>
          )}
        </Section>
      )}

      <Section title={`Lifecycle · ${group.records.length}`}>
        <div className="flex flex-col gap-1">
          {group.records.map((record) => {
            const rm = severityMeta(record.severity);
            return (
              <div key={record.seq} className="flex items-start gap-2">
                <span className={cn("material-symbols-outlined text-[14px] mt-0.5 shrink-0", rm.text)}>
                  {kindIcon(record.kind)}
                </span>
                <span className="font-mono text-[10px] text-text-subtle tabular-nums mt-0.5 shrink-0">{record.time}</span>
                <span className="min-w-0 flex-1 font-mono text-[11px] leading-relaxed text-text-muted whitespace-pre-wrap break-words">
                  {record.message || record.text}
                </span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Raw lines" defaultOpen={false}>
        <pre className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-words text-text-muted bg-surface-2 rounded-[9px] p-2.5">
          {groupText}
        </pre>
      </Section>

      <div className="border-t border-border-subtle p-3">
        {observabilityEnabled ? (
          <a
            href={`/dashboard/usage?tab=details&reqId=${encodeURIComponent(group.reqId)}`}
            className={cn(
              "w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-[10px]",
              "bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600 transition-colors"
            )}
          >
            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
            Full request details
          </a>
        ) : (
          <Tooltip text="Turn on request observability in Settings to store full request and response payloads" position="top">
            <span
              className={cn(
                "w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-[10px]",
                "bg-surface-2 text-text-subtle text-xs font-semibold cursor-not-allowed"
              )}
            >
              <span className="material-symbols-outlined text-[16px]">lock</span>
              Full details need observability
            </span>
          </Tooltip>
        )}
      </div>
    </>
  );
}

/** Right-hand inspector: the whole lifecycle of whatever is selected. */
export default function RequestInspector({ selected, observabilityEnabled }) {
  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
      {!selected ? (
        <EmptyState />
      ) : selected.type === "request" ? (
        <RequestDetail group={selected} observabilityEnabled={observabilityEnabled} />
      ) : (
        <SystemInspector record={selected.record} />
      )}
    </div>
  );
}
