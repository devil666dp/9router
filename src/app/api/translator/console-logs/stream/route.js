import { getConsoleLogs, getConsoleEmitter, initConsoleLogCapture } from "@/lib/consoleLogBuffer";

export const dynamic = "force-dynamic";

initConsoleLogCapture();

export async function GET(request) {
  const encoder = new TextEncoder();
  const emitter = getConsoleEmitter();
  const state = { closed: false, send: null, sendLines: null, sendClear: null, keepalive: null };

  // Idempotent: safe to call from request.signal abort, cancel(), or enqueue failure.
  const cleanup = () => {
    if (state.closed) return;
    state.closed = true;
    if (state.send) emitter.off("line", state.send);
    if (state.sendLines) emitter.off("lines", state.sendLines);
    if (state.sendClear) emitter.off("clear", state.sendClear);
    if (state.keepalive) clearInterval(state.keepalive);
  };

  // request.signal fires reliably on client disconnect; ReadableStream.cancel()
  // is not always invoked in Next.js, which caused listeners to accumulate.
  request.signal.addEventListener("abort", cleanup, { once: true });

  const stream = new ReadableStream({
    start(controller) {
      // Send all buffered logs immediately on connect
      const buffered = getConsoleLogs();
      // appendRecord() pushes to the ring buffer and to the pending-flush queue in the
      // same call, so a viewer connecting between the two gets a line in `init` AND
      // again in the next `lines` batch. Remember how far `init` reached and drop
      // anything at or below it — otherwise the client renders duplicate seqs and React
      // warns about repeated keys.
      let sentThrough = buffered.length ? buffered[buffered.length - 1].seq || 0 : 0;
      if (buffered.length > 0) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "init", logs: buffered })}\n\n`));
      }

      const fresh = (records) => {
        const out = [];
        for (const record of records) {
          const seq = record?.seq || 0;
          if (seq && seq <= sentThrough) continue;
          if (seq > sentThrough) sentThrough = seq;
          out.push(record);
        }
        return out;
      };

      // Push new lines as they arrive
      state.send = (line) => {
        if (state.closed) return;
        const [next] = fresh(line ? [line] : []);
        if (!next) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "line", line: next })}\n\n`));
        } catch {
          cleanup();
        }
      };

      state.sendLines = (lines) => {
        if (state.closed || !Array.isArray(lines) || lines.length === 0) return;
        const next = fresh(lines);
        if (!next.length) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "lines", lines: next })}\n\n`));
        } catch {
          cleanup();
        }
      };

      // Notify client when cleared
      state.sendClear = () => {
        if (state.closed) return;
        sentThrough = 0;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "clear" })}\n\n`));
        } catch {
          cleanup();
        }
      };

      emitter.on("line", state.send);
      emitter.on("lines", state.sendLines);
      emitter.on("clear", state.sendClear);

      // Keepalive ping every 25s
      state.keepalive = setInterval(() => {
        if (state.closed) { clearInterval(state.keepalive); return; }
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 25000);
    },

    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
