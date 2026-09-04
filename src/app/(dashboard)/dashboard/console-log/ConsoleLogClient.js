"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/shared/utils/cn";
import { useConsoleStream } from "./hooks/useConsoleStream";
import { useConsoleFilters } from "./hooks/useConsoleFilters";
import {
  buildFacets, computeStats, filterItems, groupRecords, itemsToRecords, toJsonExport, toLogText,
} from "./utils/consoleGroups";
import { downloadText, fileStamp } from "./utils/format";
import ConsoleToolbar from "./components/ConsoleToolbar";
import ConsoleStats from "./components/ConsoleStats";
import ConsoleStream from "./components/ConsoleStream";
import RequestInspector from "./components/RequestInspector";
import RawConsole from "./components/RawConsole";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";

/**
 * The console: a live, structured view of everything the gateway prints.
 *
 * Layout is an inspector — a dense stream on the left, the selected request's full
 * lifecycle on the right. All derived state (groups, facets, stats) comes from pure
 * functions in ./utils/consoleGroups so the list, the filters and the stats strip can
 * never disagree, and none of it queries the database.
 */
export default function ConsoleLogClient() {
  const { prefs, set, toggleFacet, resetFilters, activeFilterCount } = useConsoleFilters();
  const [paused, setPaused] = useState(false);
  const [maxLines, setMaxLines] = useState(CONSOLE_LOG_CONFIG.maxLines);
  const [selectedKey, setSelectedKey] = useState(null);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [observabilityEnabled, setObservabilityEnabled] = useState(false);
  const searchRef = useRef(null);

  const { records, connected, bufferedWhilePaused, clear } = useConsoleStream({ paused, maxLines });

  // The server owns the buffer cap; read it so the toolbar shows the real value.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [bufRes, setRes] = await Promise.all([
          fetch("/api/translator/console-logs"),
          fetch("/api/settings"),
        ]);
        const buf = await bufRes.json().catch(() => null);
        const settings = await setRes.json().catch(() => null);
        if (!alive) return;
        if (buf?.maxLines) setMaxLines(buf.maxLines);
        if (settings) setObservabilityEnabled(!!(settings.enableObservability || settings.enableRequestLogs));
      } catch {
        // Leave the compiled default in place; the console still works without this.
      }
    })();
    return () => { alive = false; };
  }, []);

  const items = useMemo(() => groupRecords(records), [records]);
  const facets = useMemo(() => buildFacets(items), [items]);
  const filtered = useMemo(() => filterItems(items, prefs), [items, prefs]);
  const systemCount = useMemo(() => items.filter((i) => i.type !== "request").length, [items]);

  // Stats are a function of the clock as well as the data: "req/min" decays and
  // in-flight rows age while the gateway is idle. Tick `now` on a timer and pass it in,
  // so the computation itself stays pure.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(id);
  }, []);
  const stats = useMemo(() => computeStats(items, now), [items, now]);

  // With nothing picked, the inspector tracks the newest request rather than sitting
  // empty — opening the page should already show a request's details. An explicit click
  // pins a row; Escape unpins and returns to following the newest.
  const selected = useMemo(() => {
    if (selectedKey) return filtered.find((item) => item.key === selectedKey) || null;
    for (let i = filtered.length - 1; i >= 0; i--) {
      if (filtered[i].type === "request") return filtered[i];
    }
    return null;
  }, [filtered, selectedKey]);

  const onSelect = useCallback((item) => {
    // Both row types hand their whole item over, so the key is already on it.
    setSelectedKey(item?.key || null);
    if (item?.type === "request") {
      setExpandedIds((prev) => new Set(prev).add(item.reqId));
    }
  }, []);

  const onToggleExpand = useCallback((reqId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(reqId)) next.delete(reqId);
      else next.add(reqId);
      return next;
    });
  }, []);

  const onMaxLinesChange = useCallback(async (next) => {
    setMaxLines(next);
    try {
      const res = await fetch("/api/translator/console-logs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxLines: next }),
      });
      const data = await res.json().catch(() => null);
      if (data?.maxLines) setMaxLines(data.maxLines);
    } catch {
      // Local cap still applies for this session even if it couldn't be persisted.
    }
  }, []);

  // ── Export ────────────────────────────────────────────────────────────────
  const onCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(toLogText(filtered)); } catch { /* clipboard blocked */ }
  }, [filtered]);

  const onDownloadLog = useCallback(() => {
    downloadText(`9router-console-${fileStamp()}.log`, toLogText(filtered));
  }, [filtered]);

  const onDownloadJson = useCallback(() => {
    downloadText(`9router-console-${fileStamp()}.json`, toJsonExport(filtered, stats), "application/json");
  }, [filtered, stats]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "Escape") {
        if (typing) { el.blur(); return; }
        if (prefs.query) { set({ query: "" }); return; }
        setSelectedKey(null);
        return;
      }
      if (typing) return;

      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        if (!filtered.length) return;
        const index = filtered.findIndex((item) => item.key === selected?.key);
        const nextIndex = e.key === "j"
          ? Math.min(filtered.length - 1, index < 0 ? filtered.length - 1 : index + 1)
          : Math.max(0, index < 0 ? filtered.length - 1 : index - 1);
        onSelect(filtered[nextIndex]);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, selected, onSelect, prefs.query, set]);

  const isRaw = prefs.view === "raw";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-text-main">Console</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Live gateway output, grouped by request. Held in memory — nothing here touches the database.
          </p>
        </div>
        {paused && (
          <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-warning/12 text-warning text-[11px] font-semibold">
            <span className="material-symbols-outlined text-[14px]">pause</span>
            Paused{bufferedWhilePaused ? ` · ${bufferedWhilePaused.toLocaleString()} held` : ""}
          </span>
        )}
      </div>

      <div
        className={cn(
          "flex flex-col bg-surface border border-border-subtle rounded-[14px] shadow-[var(--shadow-soft)] overflow-hidden",
          // Fill the viewport under the dashboard's own padding without needing a
          // full-height exception in DashboardLayout.
          "h-[calc(100vh-13rem)] min-h-[460px]"
        )}
      >
        <ConsoleToolbar
          prefs={prefs}
          set={set}
          toggleFacet={toggleFacet}
          resetFilters={resetFilters}
          activeFilterCount={activeFilterCount}
          facets={facets}
          connected={connected}
          paused={paused}
          onTogglePause={() => setPaused((v) => !v)}
          bufferedWhilePaused={bufferedWhilePaused}
          visibleCount={filtered.length}
          totalCount={items.length}
          systemCount={systemCount}
          maxLines={maxLines}
          onMaxLinesChange={onMaxLinesChange}
          onClear={clear}
          onCopy={onCopy}
          onDownloadLog={onDownloadLog}
          onDownloadJson={onDownloadJson}
          searchRef={searchRef}
        />

        <ConsoleStats stats={stats} />

        {isRaw ? (
          <RawConsole
            records={itemsToRecords(filtered)}
            follow={prefs.follow}
            onFollowChange={(v) => set({ follow: v })}
          />
        ) : (
          <div className="flex flex-1 min-h-0">
            <div className="flex flex-col flex-1 min-w-0 border-r border-border-subtle">
              <ConsoleStream
                items={filtered}
                selectedKey={selected?.key || null}
                expandedIds={expandedIds}
                dense={prefs.density === "dense"}
                follow={prefs.follow}
                onFollowChange={(v) => set({ follow: v })}
                onSelect={onSelect}
                onToggleExpand={onToggleExpand}
              />
            </div>
            <aside className="hidden lg:flex flex-col w-[340px] xl:w-[380px] shrink-0">
              <RequestInspector selected={selected} observabilityEnabled={observabilityEnabled} />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
