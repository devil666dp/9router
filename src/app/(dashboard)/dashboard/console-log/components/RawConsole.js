"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/shared/utils/cn";

/**
 * The raw terminal view, kept as a toggle beside the structured stream.
 *
 * Prints `record.text` — the exact bytes the buffer captured — so what you copy here
 * matches what the server printed. Severity only tints the line; no reformatting.
 */
export default function RawConsole({ records, follow, onFollowChange }) {
  const scrollRef = useRef(null);
  const [pending, setPending] = useState(0);
  const lastCountRef = useRef(records.length);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setPending(0);
  }, []);

  useEffect(() => {
    const added = records.length - lastCountRef.current;
    lastCountRef.current = records.length;
    if (added <= 0) return;
    if (follow) requestAnimationFrame(scrollToBottom);
    else setPending((n) => n + added);
  }, [records.length, follow, scrollToBottom]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (atBottom) {
      setPending(0);
      if (!follow) onFollowChange(true);
    } else if (follow) {
      onFollowChange(false);
    }
  }, [follow, onFollowChange]);

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="absolute inset-0 overflow-auto custom-scrollbar bg-[#0b0b0c] px-3 py-2"
      >
        {records.length === 0 ? (
          <span className="font-mono text-[11px] text-zinc-500">No console output captured yet.</span>
        ) : (
          <div className="min-w-max">
            {records.map((record) => {
              const isError = record.severity === "error";
              const isWarn = record.severity === "warn";
              const isOk = record.severity === "success";
              return (
                <div
                  key={record.seq}
                  className={cn(
                    "font-mono text-[11px] leading-[1.55] whitespace-pre",
                    isError ? "text-red-400" : isWarn ? "text-amber-300" : isOk ? "text-emerald-400" : "text-zinc-300"
                  )}
                >
                  {record.text}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pending > 0 && (
        <button
          type="button"
          onClick={() => { onFollowChange(true); scrollToBottom(); }}
          className={cn(
            "absolute bottom-3 left-1/2 -translate-x-1/2 z-10",
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full",
            "bg-zinc-100 text-zinc-900 text-[11px] font-semibold shadow-lg hover:opacity-90 transition-opacity"
          )}
        >
          <span className="material-symbols-outlined text-[15px]">arrow_downward</span>
          {pending.toLocaleString()} new · jump to latest
        </button>
      )}
    </div>
  );
}
