"use client";

import { cn } from "@/shared/utils/cn";
import Tooltip from "@/shared/components/Tooltip";
import { fmtMs, fmtPct, fmtTokens } from "../utils/format";

function Stat({ label, value, hint, tone = "default", pulse = false }) {
  const tones = {
    default: "text-text-main",
    muted: "text-text-muted",
    error: "text-danger",
    success: "text-success",
    brand: "text-brand-600 dark:text-brand-400",
  };

  return (
    <Tooltip text={hint} position="bottom">
      <div className="flex flex-col gap-0.5 px-3.5 py-2 min-w-[84px] text-left">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-subtle">{label}</span>
        <span className={cn("text-[15px] font-semibold tabular-nums leading-none flex items-center gap-1.5", tones[tone])}>
          {pulse && <span className="size-1.5 rounded-full bg-info animate-pulse shrink-0" />}
          {value}
        </span>
      </div>
    </Tooltip>
  );
}

/**
 * Live stats over the buffer window.
 *
 * Everything here is derived from the streamed lines — no extra request, and no claim
 * to be all-time. The Usage page owns global numbers.
 */
export default function ConsoleStats({ stats }) {
  const errTone = stats.errors > 0 ? "error" : "muted";

  return (
    <div className="flex items-stretch flex-wrap divide-x divide-border-subtle border-b border-border-subtle bg-surface-2/40">
      <Stat
        label="In flight"
        value={stats.inFlight}
        pulse={stats.inFlight > 0}
        tone={stats.inFlight > 0 ? "brand" : "muted"}
        hint="Requests that logged a start but no completion, error or abort yet"
      />
      <Stat
        label="Requests"
        value={stats.total}
        tone="default"
        hint={`Requests in the buffer${stats.spanSeconds ? ` · spanning ${fmtMs(stats.spanSeconds * 1000)}` : ""}`}
      />
      <Stat
        label="Req/min"
        value={stats.reqPerMin}
        tone="muted"
        hint="Requests started in the last 60 seconds"
      />
      <Stat
        label="Errors"
        value={stats.errors ? `${stats.errors} · ${fmtPct(stats.errorRate)}` : "0"}
        tone={errTone}
        hint="Failed or aborted, as a share of requests that finished"
      />
      <Stat
        label="p50"
        value={fmtMs(stats.p50)}
        tone="muted"
        hint="Median total latency of finished requests in the buffer"
      />
      <Stat
        label="p95"
        value={fmtMs(stats.p95)}
        tone="muted"
        hint="95th percentile total latency of finished requests in the buffer"
      />
      <Stat
        label="TTFT p50"
        value={fmtMs(stats.p50Ttft)}
        tone="muted"
        hint="Median time to first token, streaming requests only"
      />
      <Stat
        label="Tokens"
        value={`${fmtTokens(stats.inTokens)} / ${fmtTokens(stats.outTokens)}`}
        tone="muted"
        hint={`In / out across the buffer${stats.cacheRead ? ` · ${fmtTokens(stats.cacheRead)} served from cache` : ""}`}
      />
    </div>
  );
}
