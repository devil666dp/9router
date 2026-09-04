"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/utils/cn";
import Tooltip from "@/shared/components/Tooltip";
import { SEVERITIES } from "@/shared/utils/consoleLogRecord";

const SEVERITY_LABELS = { debug: "All", info: "Info+", success: "OK+", warn: "Warn+", error: "Errors" };

function IconButton({ icon, label, onClick, active = false, tone = "default", disabled = false }) {
  const tones = {
    default: active
      ? "bg-brand-500/12 text-brand-600 dark:text-brand-400 border-brand-500/30"
      : "text-text-muted hover:text-text-main hover:bg-surface-2 border-transparent",
    danger: "text-text-muted hover:text-danger hover:bg-danger/10 border-transparent",
  };

  return (
    <Tooltip text={label} position="bottom">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          "inline-flex items-center justify-center size-8 rounded-[9px] border transition-colors",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          tones[tone]
        )}
      >
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      </button>
    </Tooltip>
  );
}

/** A facet chip list. Values come from the buffer, so every option matches a row. */
function FacetMenu({ icon, label, options, selected, onToggle, formatValue }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click / Escape — a menu that traps focus in a log viewer is worse
  // than no menu at all.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const count = selected.length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!options.length}
        className={cn(
          "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[9px] border text-xs font-medium transition-colors",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          count
            ? "bg-brand-500/12 text-brand-600 dark:text-brand-400 border-brand-500/30"
            : "text-text-muted hover:text-text-main hover:bg-surface-2 border-border-subtle"
        )}
      >
        <span className="material-symbols-outlined text-[16px]">{icon}</span>
        <span>{label}</span>
        {count > 0 && (
          <span className="tabular-nums rounded-full bg-brand-500 text-white px-1.5 text-[10px] leading-[16px]">{count}</span>
        )}
      </button>

      {open && (
        <div className="absolute z-40 mt-1.5 left-0 w-60 max-h-72 overflow-y-auto custom-scrollbar rounded-[12px] border border-border bg-surface shadow-[var(--shadow-elev)] p-1.5">
          {options.length === 0 ? (
            <p className="px-2 py-2 text-xs text-text-muted">Nothing in the buffer yet.</p>
          ) : (
            options.map((opt) => {
              const isOn = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onToggle(opt.value)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-[8px] text-left text-xs transition-colors",
                    isOn ? "bg-brand-500/10 text-text-main" : "text-text-muted hover:bg-surface-2 hover:text-text-main"
                  )}
                >
                  <span className={cn(
                    "material-symbols-outlined text-[16px] shrink-0",
                    isOn ? "text-brand-500" : "text-text-subtle"
                  )}>
                    {isOn ? "check_box" : "check_box_outline_blank"}
                  </span>
                  <span className="flex-1 truncate font-mono">{formatValue ? formatValue(opt.value) : opt.value}</span>
                  <span className="tabular-nums text-[10px] text-text-subtle shrink-0">{opt.count}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function ExportMenu({ onCopy, onDownloadLog, onDownloadJson, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const act = (fn) => () => { fn(); setOpen(false); };

  const items = [
    { icon: "content_copy", label: "Copy filtered view", hint: "Exact log text", onClick: act(onCopy) },
    { icon: "description", label: "Download .log", hint: "Verbatim lines", onClick: act(onDownloadLog) },
    { icon: "data_object", label: "Download .json", hint: "Parsed requests + stats", onClick: act(onDownloadJson) },
  ];

  return (
    <div className="relative" ref={ref}>
      <IconButton icon="download" label="Export" onClick={() => setOpen((v) => !v)} active={open} disabled={disabled} />
      {open && (
        <div className="absolute z-40 mt-1.5 right-0 w-56 rounded-[12px] border border-border bg-surface shadow-[var(--shadow-elev)] p-1.5">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className="w-full flex items-start gap-2.5 px-2 py-2 rounded-[8px] text-left text-text-muted hover:bg-surface-2 hover:text-text-main transition-colors"
            >
              <span className="material-symbols-outlined text-[17px] mt-px shrink-0">{item.icon}</span>
              <span className="flex flex-col">
                <span className="text-xs font-medium text-text-main">{item.label}</span>
                <span className="text-[10px] text-text-subtle">{item.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BufferSizeMenu({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const options = [200, 500, 1000, 2500, 5000, 10000];

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <IconButton icon="settings" label={`Buffer: ${value.toLocaleString()} lines`} onClick={() => setOpen((v) => !v)} active={open} />
      {open && (
        <div className="absolute z-40 mt-1.5 right-0 w-52 rounded-[12px] border border-border bg-surface shadow-[var(--shadow-elev)] p-1.5">
          <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-subtle">
            Buffer size
          </p>
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false); }}
              className={cn(
                "w-full flex items-center justify-between px-2 py-1.5 rounded-[8px] text-xs transition-colors",
                opt === value ? "bg-brand-500/10 text-text-main" : "text-text-muted hover:bg-surface-2 hover:text-text-main"
              )}
            >
              <span className="tabular-nums">{opt.toLocaleString()} lines</span>
              {opt === value && <span className="material-symbols-outlined text-[15px] text-brand-500">check</span>}
            </button>
          ))}
          <p className="px-2 pt-1.5 pb-1 text-[10px] leading-snug text-text-subtle border-t border-border-subtle mt-1">
            Held in the server&apos;s memory and shared by every viewer.
          </p>
        </div>
      )}
    </div>
  );
}

export default function ConsoleToolbar({
  prefs, set, toggleFacet, resetFilters, activeFilterCount,
  facets, connected, paused, onTogglePause, bufferedWhilePaused,
  visibleCount, totalCount, systemCount, maxLines, onMaxLinesChange,
  onClear, onCopy, onDownloadLog, onDownloadJson, searchRef,
}) {
  const isRaw = prefs.view === "raw";

  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 border-b border-border-subtle">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Connection + follow */}
        <div className="flex items-center gap-1.5 pr-1">
          <Tooltip text={connected ? "Streaming from the gateway" : "Disconnected — retrying"} position="bottom">
            <span className="flex items-center gap-1.5 h-8 px-2.5 rounded-[9px] bg-surface-2 text-xs font-medium">
              <span className={cn(
                "size-1.5 rounded-full shrink-0",
                connected ? "bg-success animate-pulse" : "bg-danger"
              )} />
              <span className={connected ? "text-text-muted" : "text-danger"}>
                {connected ? "Live" : "Offline"}
              </span>
            </span>
          </Tooltip>

          <IconButton
            icon={paused ? "play_arrow" : "pause"}
            label={paused ? `Resume${bufferedWhilePaused ? ` · ${bufferedWhilePaused} held` : ""}` : "Pause the stream"}
            active={paused}
            onClick={onTogglePause}
          />
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-text-subtle pointer-events-none">
            search
          </span>
          <input
            ref={searchRef}
            type="text"
            value={prefs.query}
            onChange={(e) => set({ query: e.target.value })}
            placeholder="Filter lines, models, errors…  ( / )"
            className={cn(
              "w-full h-8 pl-8 pr-8 rounded-[9px] bg-surface-2 border border-transparent",
              "text-xs text-text-main placeholder-text-subtle font-mono",
              "focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-500/40 transition-all"
            )}
          />
          {prefs.query && (
            <button
              type="button"
              onClick={() => set({ query: "" })}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text-main"
            >
              <span className="material-symbols-outlined text-[15px]">close</span>
            </button>
          )}
        </div>

        {/* Severity */}
        <div className="inline-flex items-center h-8 p-0.5 rounded-[9px] bg-surface-2">
          {SEVERITIES.filter((s) => s !== "success").map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => set({ severity: sev })}
              className={cn(
                "px-2 h-7 rounded-[7px] text-[11px] font-medium transition-all",
                prefs.severity === sev ? "bg-surface text-text-main shadow-sm" : "text-text-muted hover:text-text-main"
              )}
            >
              {SEVERITY_LABELS[sev]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <IconButton
            icon={prefs.follow ? "vertical_align_bottom" : "pause_circle"}
            label={prefs.follow ? "Following new lines" : "Follow paused — scrolled up"}
            active={prefs.follow}
            onClick={() => set({ follow: !prefs.follow })}
          />
          <IconButton
            icon="terminal"
            label={isRaw ? "Switch to the structured view" : "Switch to the raw terminal view"}
            active={isRaw}
            onClick={() => set({ view: isRaw ? "structured" : "raw" })}
          />
          <ExportMenu
            onCopy={onCopy}
            onDownloadLog={onDownloadLog}
            onDownloadJson={onDownloadJson}
            disabled={visibleCount === 0}
          />
          <BufferSizeMenu value={maxLines} onChange={onMaxLinesChange} />
          <IconButton icon="delete_sweep" label="Clear the buffer for every viewer" tone="danger" onClick={onClear} />
        </div>
      </div>

      {/* Facets + counts */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Scope: the console's headline default is API calls only. */}
        <div className="inline-flex items-center h-8 p-0.5 rounded-[9px] bg-surface-2">
          {[
            { value: false, label: "API calls", icon: "swap_horiz", hint: "Only requests routed through the gateway" },
            { value: true, label: "Everything", icon: "list_alt", hint: `Include lines outside any request${systemCount ? ` · ${systemCount.toLocaleString()} in the buffer` : ""}` },
          ].map((opt) => (
            <Tooltip key={opt.label} text={opt.hint} position="bottom">
              <button
                type="button"
                onClick={() => set({ showSystem: opt.value })}
                className={cn(
                  "inline-flex items-center gap-1 px-2 h-7 rounded-[7px] text-[11px] font-medium transition-all",
                  prefs.showSystem === opt.value
                    ? "bg-surface text-text-main shadow-sm"
                    : "text-text-muted hover:text-text-main"
                )}
              >
                <span className="material-symbols-outlined text-[14px]">{opt.icon}</span>
                {opt.label}
              </button>
            </Tooltip>
          ))}
        </div>

        <FacetMenu
          icon="cloud"
          label="Provider"
          options={facets.providers}
          selected={prefs.providers}
          onToggle={(v) => toggleFacet("providers", v)}
        />
        <FacetMenu
          icon="model_training"
          label="Model"
          options={facets.models}
          selected={prefs.models}
          onToggle={(v) => toggleFacet("models", v)}
        />
        <FacetMenu
          icon="flag"
          label="Status"
          options={facets.statuses}
          selected={prefs.statuses}
          onToggle={(v) => toggleFacet("statuses", v)}
          formatValue={(v) => (v === "pending" ? "in flight" : v)}
        />

        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-[9px] text-xs font-medium text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          >
            <span className="material-symbols-outlined text-[15px]">filter_alt_off</span>
            Clear filters
          </button>
        )}

        <span className="ml-auto text-[11px] tabular-nums text-text-subtle">
          {visibleCount === totalCount
            ? `${totalCount.toLocaleString()} entries`
            : `${visibleCount.toLocaleString()} of ${totalCount.toLocaleString()} entries`}
          <span className="text-text-subtle/60"> · buffer {maxLines.toLocaleString()}</span>
        </span>
      </div>
    </div>
  );
}
