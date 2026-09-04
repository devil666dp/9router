"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Live console records over SSE.
 *
 * The server sends structured records (see src/lib/consoleLogBuffer.js) on four event
 * types: `init` with the whole buffer, `line`/`lines` with new arrivals, and `clear`.
 *
 * While paused, arrivals accumulate in a ref instead of state, so a busy gateway
 * cannot re-render the page hundreds of times behind a frozen view.
 */
export function useConsoleStream({ paused, maxLines }) {
  const [records, setRecords] = useState([]);
  const [connected, setConnected] = useState(false);
  const [bufferedWhilePaused, setBufferedWhilePaused] = useState(0);

  const pausedRef = useRef(paused);
  const heldRef = useRef([]);
  const maxRef = useRef(maxLines);
  // Highest seq already in state (or held). The server also de-duplicates, but a record
  // can legitimately reach a viewer twice — a reconnect replays the buffer, and a line
  // captured between the ring-buffer push and the batch flush is in both. `seq` is a
  // monotonic per-process counter, so dropping anything at or below the high-water mark
  // is enough to keep React keys unique.
  const seenRef = useRef(0);

  useEffect(() => { maxRef.current = maxLines; }, [maxLines]);

  const cap = useCallback((list) => {
    const max = maxRef.current;
    return list.length > max ? list.slice(-max) : list;
  }, []);

  const fresh = useCallback((incoming) => {
    const out = [];
    for (const record of incoming) {
      const seq = record?.seq || 0;
      if (seq && seq <= seenRef.current) continue;
      if (seq > seenRef.current) seenRef.current = seq;
      out.push(record);
    }
    return out;
  }, []);

  // Resuming drains whatever arrived while frozen, in order.
  useEffect(() => {
    pausedRef.current = paused;
    if (paused) return;
    if (!heldRef.current.length) return;
    const held = heldRef.current;
    heldRef.current = [];
    setBufferedWhilePaused(0);
    setRecords((prev) => cap([...prev, ...held]));
  }, [paused, cap]);

  useEffect(() => {
    const es = new EventSource("/api/translator/console-logs/stream");

    const absorb = (raw) => {
      const incoming = fresh(raw);
      if (!incoming.length) return;
      if (pausedRef.current) {
        heldRef.current.push(...incoming);
        const max = maxRef.current;
        if (heldRef.current.length > max) heldRef.current = heldRef.current.slice(-max);
        setBufferedWhilePaused(heldRef.current.length);
        return;
      }
      setRecords((prev) => cap([...prev, ...incoming]));
    };

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.type === "init") {
        // A reconnect replays the whole buffer; replace rather than append so lines
        // are never duplicated.
        const logs = Array.isArray(msg.logs) ? msg.logs : [];
        heldRef.current = [];
        seenRef.current = logs.length ? logs[logs.length - 1].seq || 0 : 0;
        setBufferedWhilePaused(0);
        setRecords(cap(logs));
      } else if (msg.type === "line") {
        absorb(msg.line ? [msg.line] : []);
      } else if (msg.type === "lines") {
        absorb(Array.isArray(msg.lines) ? msg.lines : []);
      } else if (msg.type === "clear") {
        heldRef.current = [];
        seenRef.current = 0;
        setBufferedWhilePaused(0);
        setRecords([]);
      }
    };

    es.onerror = () => setConnected(false);

    return () => es.close();
  }, [cap, fresh]);

  // Lowering the cap takes effect at render time rather than through a state trim, so a
  // resize is visible immediately. `absorb` caps what it stores, so state can overshoot
  // only until the next arrival, and only by the previous cap.
  const visible = useMemo(
    () => (records.length > maxLines ? records.slice(-maxLines) : records),
    [records, maxLines]
  );

  const clear = useCallback(async () => {
    try {
      await fetch("/api/translator/console-logs", { method: "DELETE" });
      // The server echoes a "clear" event; local state follows from there.
    } catch {
      // Offline or the route is unreachable — clear locally so the view still responds.
      heldRef.current = [];
      setRecords([]);
    }
  }, []);

  return { records: visible, connected, bufferedWhilePaused, clear };
}
