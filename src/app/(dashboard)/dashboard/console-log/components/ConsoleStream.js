"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/shared/utils/cn";
import Tooltip from "@/shared/components/Tooltip";
import { fmtElapsed, fmtMs, fmtTokens, kindIcon, severityMeta, statusMeta } from "../utils/format";

/** Live-ticking elapsed clock for an in-flight request. */
function Elapsed({ startedAt }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums">{fmtElapsed(startedAt)}</span>;
}

/** One lifecycle line beneath its request header. */
function ChildRow({ record, dense }) {
  const meta = severityMeta(record.severity);
  const detail = record.fields?.detail;

  return (
    <div
      className={cn(
        "flex items-start gap-2 pl-8 pr-3 font-mono text-[11px] leading-relaxed",
        dense ? "py-px" : "py-0.5"
      )}
    >
      <span className={cn("material-symbols-outlined text-[13px] mt-0.5 shrink-0", meta.text)}>
        {kindIcon(record.kind)}
      </span>
      <span className={cn("min-w-0 break-words", record.severity === "error" ? "text-danger" : "text-text-muted")}>
        {record.message || record.text}
        {detail && (
          <span className="block text-text-subtle whitespace-pre-wrap">{detail}</span>
        )}
      </span>
    </div>
  );
}

/** A request group: sticky header plus its lifecycle lines on a hairline rail. */
const RequestRow = memo(function RequestRow({ group, selected, expanded, dense, onSelect, onToggle }) {
  const status = statusMeta(group.status);
  const meta = severityMeta(group.severity);
  const inFlight = group.status === "pending";

  return (
    <div
      className={cn(
        "border-l-2 transition-colors",
        selected ? "bg-brand-500/[0.07] border-l-brand-500" : cn("hover:bg-surface-2/60", meta.rail)
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(group)}
        onDoubleClick={() => onToggle(group.reqId)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(group); }
        }}
        className={cn(
          "w-full flex items-center gap-2 pl-1.5 pr-3 cursor-pointer select-none",
          dense ? "py-1" : "py-1.5"
        )}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle(group.reqId); }}
          aria-label={expanded ? "Collapse" : "Expand"}
          className="shrink-0 text-text-subtle hover:text-text-main"
        >
          <span className={cn("material-symbols-outlined text-[16px] transition-transform", expanded && "rotate-90")}>
            chevron_right
          </span>
        </button>

        <span className="shrink-0 font-mono text-[11px] text-text-subtle tabular-nums w-[58px]">{group.time || "—"}</span>

        <span className="shrink-0 font-mono text-[11px] font-semibold text-brand-600 dark:text-brand-400 w-[46px]">
          #{group.reqId}
        </span>

        <span className={cn("shrink-0 size-1.5 rounded-full", meta.dot, inFlight && "animate-pulse")} />

        <span className="min-w-0 flex-1 flex items-baseline gap-1.5">
          <span className="font-mono text-xs text-text-main truncate">
            {group.provider ? `${group.provider}/${group.model}` : group.clientModel || "—"}
          </span>
          {group.savers.length > 0 && (
            <Tooltip text={`Token savers: ${group.savers.join(", ")}`} position="top">
              <span className="material-symbols-outlined text-[13px] text-text-subtle">tune</span>
            </Tooltip>
          )}
          {group.refreshed && (
            <Tooltip text="Credentials were refreshed mid-request" position="top">
              <span className="material-symbols-outlined text-[13px] text-warning">key</span>
            </Tooltip>
          )}
          {group.stream === true && (
            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-text-subtle">stream</span>
          )}
        </span>

        <span className="shrink-0 hidden sm:block font-mono text-[11px] text-text-muted tabular-nums w-[68px] text-right">
          {inFlight ? <Elapsed startedAt={group.startedAt} /> : fmtMs(group.totalMs)}
        </span>

        <span className="shrink-0 hidden md:block font-mono text-[11px] text-text-subtle tabular-nums w-[86px] text-right">
          {group.inTokens != null || group.outTokens != null
            ? `${fmtTokens(group.inTokens)} / ${fmtTokens(group.outTokens)}`
            : "—"}
        </span>

        <span
          className={cn(
            "shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold w-[74px] justify-center",
            group.status === "success" && "bg-success/10 text-success",
            group.status === "error" && "bg-danger/10 text-danger",
            group.status === "aborted" && "bg-warning/10 text-warning",
            inFlight && "bg-info/10 text-info"
          )}
        >
          {group.statusCode || status.label}
        </span>
      </div>

      {expanded && (
        <div className="pb-1 ml-[7px] border-l border-border-subtle">
          {group.records.map((record) => (
            <ChildRow key={record.seq} record={record} dense={dense} />
          ))}
        </div>
      )}
    </div>
  );
});

/** A standalone system line: [RTK], [DB], warnings, anything without a request id. */
const SystemRow = memo(function SystemRow({ record, selected, dense, onSelect }) {
  const meta = severityMeta(record.severity);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(record)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(record); }
      }}
      className={cn(
        "flex items-start gap-2 pl-1.5 pr-3 border-l-2 cursor-pointer transition-colors",
        dense ? "py-0.5" : "py-1",
        selected ? "bg-brand-500/[0.07] border-l-brand-500" : cn("hover:bg-surface-2/60", meta.rail)
      )}
    >
      <span className="shrink-0 w-[16px]" />
      <span className="shrink-0 font-mono text-[11px] text-text-subtle tabular-nums w-[58px] mt-px">
        {record.time || "—"}
      </span>
      <span className="shrink-0 w-[46px] mt-px">
        {record.tag && (
          <span className="font-mono text-[10px] font-semibold text-text-subtle uppercase truncate block">
            {record.tag}
          </span>
        )}
      </span>
      <span className={cn("shrink-0 size-1.5 rounded-full mt-[7px]", meta.dot)} />
      <span
        className={cn(
          "min-w-0 flex-1 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words",
          record.severity === "error" ? "text-danger" : record.severity === "warn" ? "text-text-main" : "text-text-muted"
        )}
      >
        {record.message || record.text}
      </span>
    </div>
  );
});

const WINDOW_STEP = 300;

/**
 * The scrolling stream.
 *
 * Follow mode auto-scrolls only while the viewport is already pinned to the bottom; the
 * moment the user scrolls up it disengages and a "jump to latest" pill appears. The old
 * implementation force-scrolled on every batch, which made history unreadable under load.
 *
 * Only the newest `windowSize` entries are rendered, with a "load older" control, so a
 * 10k-line buffer doesn't mount 10k rows and no virtualization dependency is needed.
 */
export default function ConsoleStream({
  items, selectedKey, expandedIds, dense, follow, onFollowChange, onSelect, onToggleExpand,
}) {
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const [windowSize, setWindowSize] = useState(WINDOW_STEP);
  const [pendingBelow, setPendingBelow] = useState(0);
  const lastCountRef = useRef(items.length);

  const atBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    // 24px of slack: a row's own height shouldn't count as "scrolled away".
    return el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setPendingBelow(0);
  }, []);

  // New arrivals: follow if pinned, otherwise count what the user hasn't seen.
  useEffect(() => {
    const added = items.length - lastCountRef.current;
    lastCountRef.current = items.length;
    if (added <= 0) return;

    if (follow) {
      // Wait for the rows to lay out before measuring scrollHeight.
      requestAnimationFrame(scrollToBottom);
    } else {
      setPendingBelow((n) => n + added);
    }
  }, [items.length, follow, scrollToBottom]);

  const onScroll = useCallback(() => {
    const bottom = atBottom();
    if (bottom) {
      setPendingBelow(0);
      if (!follow) onFollowChange(true);
    } else if (follow) {
      onFollowChange(false);
    }
  }, [atBottom, follow, onFollowChange]);

  const hidden = Math.max(0, items.length - windowSize);
  const visible = hidden > 0 ? items.slice(hidden) : items;

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="absolute inset-0 overflow-y-auto custom-scrollbar"
      >
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setWindowSize((n) => n + WINDOW_STEP * 3)}
            className="w-full py-2 text-[11px] font-medium text-text-muted hover:text-text-main hover:bg-surface-2 border-b border-border-subtle transition-colors"
          >
            Load {Math.min(hidden, WINDOW_STEP * 3).toLocaleString()} older
            <span className="text-text-subtle"> · {hidden.toLocaleString()} hidden above</span>
          </button>
        )}

        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 h-full py-16 text-center">
            <span className="material-symbols-outlined text-[32px] text-text-subtle/60">terminal</span>
            <p className="text-sm text-text-muted">Nothing to show</p>
            <p className="text-xs text-text-subtle max-w-xs">
              Send a request through the gateway, or clear the filters if you have some active.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle/60">
            {visible.map((item) =>
              item.type === "request" ? (
                <RequestRow
                  key={item.key}
                  group={item}
                  dense={dense}
                  selected={selectedKey === item.key}
                  expanded={expandedIds.has(item.reqId)}
                  onSelect={onSelect}
                  onToggle={onToggleExpand}
                />
              ) : (
                <SystemRow
                  key={item.key}
                  record={item.record}
                  dense={dense}
                  selected={selectedKey === item.key}
                  onSelect={() => onSelect(item)}
                />
              )
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {pendingBelow > 0 && (
        <button
          type="button"
          onClick={() => { onFollowChange(true); scrollToBottom(); }}
          className={cn(
            "absolute bottom-3 left-1/2 -translate-x-1/2 z-10",
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full",
            "bg-text-main text-bg text-[11px] font-semibold shadow-[var(--shadow-elev)]",
            "hover:opacity-90 transition-opacity"
          )}
        >
          <span className="material-symbols-outlined text-[15px]">arrow_downward</span>
          {pendingBelow.toLocaleString()} new · jump to latest
        </button>
      )}
    </div>
  );
}
