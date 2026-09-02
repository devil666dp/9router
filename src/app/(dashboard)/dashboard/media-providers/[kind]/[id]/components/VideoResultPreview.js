"use client";

import { useEffect, useRef, useState } from "react";
import { extractVideoUrl, isVideoPending, videoErrorMessage } from "./exampleShared";

// A create POST normally answers with the finished video: the adapters that need
// it (qwen, fal, replicate) wait the render out server-side. It only comes back
// still rendering when the job outlives VIDEO_AWAIT_TIMEOUT_MS — or for a
// provider proxied verbatim (xAI), which always answers with just a job id. Both
// cases finish here with the same GET /v1/videos/{id} the CLI polls.
const POLL_INTERVAL_MS = 5000;
const POLL_DEADLINE_MS = 10 * 60 * 1000;

/**
 * The finished video for a /v1/videos result, polling the job out first if needed.
 *
 * `provider` and `connectionId` come from the create response's
 * `x-9router-provider` / `x-9router-connection-id` headers and MUST be echoed
 * back as `x-provider` / `x-connection-id`: a job id is bound to the account and
 * provider that minted it, so a poll without them can reach the wrong upstream.
 *
 * @param {object} props
 * @param {object|null} props.payload - the create (or poll) JSON as returned
 * @param {string} [props.provider] - x-9router-provider from the create response
 * @param {string} [props.connectionId] - x-9router-connection-id from the create response
 * @param {string} [props.apiKey] - gateway key, when one is configured
 * @param {(payload: object) => void} [props.onResolved] - lift the finished poll
 *   payload back to the caller so its JSON view shows the video URL too
 *
 * Mount this with a per-run `key` so a new generation starts from clean state
 * rather than briefly showing the previous job's video.
 */
export function VideoResultPreview({ payload, provider, connectionId, apiKey, onResolved }) {
  const [polled, setPolled] = useState(null);
  const [pollError, setPollError] = useState("");
  const [gaveUp, setGaveUp] = useState(false);
  // Keeps the polling effect from re-running (and re-polling) when the parent
  // re-renders with a new inline callback.
  const onResolvedRef = useRef(onResolved);
  useEffect(() => { onResolvedRef.current = onResolved; });

  const current = polled || payload;
  const url = extractVideoUrl(current);
  const jobId = payload?.request_id || payload?.id || "";
  const pending = !url && isVideoPending(current);

  useEffect(() => {
    if (!pending || !jobId) return;
    let cancelled = false;
    const controller = new AbortController();
    const deadline = Date.now() + POLL_DEADLINE_MS;

    const poll = async () => {
      while (!cancelled) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (cancelled) return;
        if (Date.now() > deadline) {
          setGaveUp(true);
          return;
        }
        try {
          const headers = { Accept: "application/json" };
          if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
          if (provider) headers["x-provider"] = provider;
          if (connectionId) headers["x-connection-id"] = connectionId;
          const res = await fetch(`/api/v1/videos/${encodeURIComponent(jobId)}`, { headers, signal: controller.signal });
          const data = await res.json().catch(() => null);
          if (cancelled) return;
          if (!res.ok) {
            // A poll can 5xx transiently while the job is alive upstream, so keep
            // trying until the deadline rather than reporting the job as failed.
            setPollError(data?.error?.message || data?.error || `HTTP ${res.status}`);
            continue;
          }
          setPollError("");
          setPolled(data);
          if (extractVideoUrl(data) || !isVideoPending(data)) {
            onResolvedRef.current?.(data);
            return;
          }
        } catch (error) {
          if (cancelled || error?.name === "AbortError") return;
          setPollError(error.message || "Network error");
        }
      }
    };
    poll();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [pending, jobId, provider, connectionId, apiKey]);

  if (!payload) return null;

  const failureMessage = videoErrorMessage(current);

  if (url) {
    return (
      <div className="mt-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Video</span>
          <a
            href={url}
            download="video.mp4"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">download</span>
            Download
          </a>
        </div>
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          className="max-w-full rounded-lg border border-border bg-black"
        />
      </div>
    );
  }

  if (failureMessage) {
    return <p className="mt-2 text-xs text-red-500 break-words">{failureMessage}</p>;
  }

  if (!pending && !gaveUp) return null;

  return (
    <div className="mt-2 flex flex-col gap-2 px-3 py-2 rounded-lg bg-sidebar border border-border">
      <div className="flex items-center gap-2">
        <span
          className="material-symbols-outlined text-[16px] text-primary"
          style={gaveUp ? undefined : { animation: "spin 1s linear infinite" }}
        >
          {gaveUp ? "hourglass_top" : "progress_activity"}
        </span>
        <span className="text-xs text-text-muted">
          {gaveUp
            ? "Still rendering — poll GET /v1/videos/{id} to finish the job."
            : `Rendering${current?.status ? ` · ${current.status}` : ""}${
                current?.queue_position !== undefined ? ` · queue ${current.queue_position}` : ""
              }`}
        </span>
      </div>
      {jobId && (
        <span className="text-[11px] font-mono text-text-muted break-all">{jobId}</span>
      )}
      {pollError && <span className="text-[11px] text-red-500 break-words">{pollError}</span>}
    </div>
  );
}
