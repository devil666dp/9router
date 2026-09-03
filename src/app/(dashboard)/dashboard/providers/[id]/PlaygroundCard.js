"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import PropTypes from "prop-types";
import { Card } from "@/shared/components";
import FieldRow from "@/shared/components/FieldRow";
import { getThinkingLevels } from "open-sse/providers/thinkingLevels.js";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { readChunk, frameOf, stripDoneTerminator } from "@/shared/utils/chatFrames";

const MANUAL_MODEL = "__manual__";
const DEFAULT_PROMPT = "Reply with one short sentence: what is 9Router?";
const DEFAULT_RESPONSE_EXAMPLE = `{
  "id": "chatcmpl-...",
  "choices": [
    { "index": 0, "message": { "role": "assistant", "content": "..." }, "finish_reason": "stop" }
  ],
  "usage": { "prompt_tokens": 12, "completion_tokens": 24, "total_tokens": 36 }
}`;

const subscribeNoop = () => () => {};
const getOrigin = () => window.location.origin;
const getOriginServer = () => "";

// Prompts routinely contain apostrophes; keep the copied curl paste-able.
function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export default function PlaygroundCard({ providerId, providerAlias, providerDisplayAlias, models = [], connections = [], isFreeNoAuth = false }) {
  const modelOptions = models.filter((m) => m?.id);
  // Empty = "not chosen yet"; the first model is picked by derivation below so a
  // provider whose list arrives late (cursor live models, imported customs) still
  // lands on a real model without a setState-in-effect sync.
  const [pickedModel, setPickedModel] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [thinkingLevel, setThinkingLevel] = useState("auto");
  const [pinnedConnectionId, setPinnedConnectionId] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [temperature, setTemperature] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [stream, setStream] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [tunnelEndpoint, setTunnelEndpoint] = useState("");
  const [useTunnel, setUseTunnel] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [answer, setAnswer] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [result, setResult] = useState(null); // { data, latencyMs, usage, servedBy, finishReason }
  const [showRaw, setShowRaw] = useState(false);
  // Browser-only value: "" during SSR so hydration matches, real origin on the
  // client. useSyncExternalStore instead of an effect — no cascading render.
  const endpoint = useSyncExternalStore(subscribeNoop, getOrigin, getOriginServer);
  const abortRef = useRef(null);
  const { copied: copiedCurl, copy: copyCurl } = useCopyToClipboard();
  const { copied: copiedAnswer, copy: copyAnswer } = useCopyToClipboard();

  useEffect(() => {
    fetch("/api/keys")
      .then((r) => r.json())
      .then((d) => { setApiKey((d.keys || []).find((k) => k.isActive !== false)?.key || ""); })
      .catch(() => {});
    fetch("/api/tunnel/status")
      .then((r) => r.json())
      .then((d) => { if (d.publicUrl) setTunnelEndpoint(d.publicUrl); })
      .catch(() => {});
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const selectedModel = pickedModel || modelOptions[0]?.id || MANUAL_MODEL;

  const isManual = selectedModel === MANUAL_MODEL;
  const modelId = (isManual ? manualModel : selectedModel).trim();
  const levels = modelId && !isManual ? getThinkingLevels(providerId, modelId) : null;
  const levelOptions = levels ? ["auto", ...levels.filter((l) => l !== "none")] : null;
  const effectiveLevel = levelOptions && levelOptions.includes(thinkingLevel) ? thinkingLevel : "auto";
  // Thinking level rides along as a "(level)" suffix on the model id — same
  // convention the model list uses when copying a name.
  const routedModel = modelId
    ? `${providerAlias}/${modelId}${effectiveLevel !== "auto" ? `(${effectiveLevel})` : ""}`
    : "";
  const displayModel = modelId
    ? `${providerDisplayAlias}/${modelId}${effectiveLevel !== "auto" ? `(${effectiveLevel})` : ""}`
    : "";
  const baseUrl = useTunnel && tunnelEndpoint ? tunnelEndpoint : endpoint;

  const buildBody = () => {
    const messages = [];
    if (systemPrompt.trim()) messages.push({ role: "system", content: systemPrompt.trim() });
    messages.push({ role: "user", content: prompt });
    const body = { model: routedModel, messages };
    if (stream) {
      body.stream = true;
      body.stream_options = { include_usage: true };
    }
    const temp = Number(temperature);
    if (temperature !== "" && Number.isFinite(temp)) body.temperature = temp;
    const max = Number(maxTokens);
    if (maxTokens !== "" && Number.isFinite(max) && max > 0) body.max_tokens = max;
    return body;
  };

  const curlArgs = [
    `-X POST ${baseUrl || "http://localhost:20128"}/v1/chat/completions`,
    `-H "Content-Type: application/json"`,
    `-H "Authorization: Bearer ${apiKey || "YOUR_KEY"}"`,
    ...(pinnedConnectionId ? [`-H "x-connection-id: ${pinnedConnectionId}"`] : []),
    ...(stream ? ["-N"] : []),
    `-d ${shellQuote(JSON.stringify(buildBody()))}`,
  ];
  const curlSnippet = `curl ${curlArgs.join(" \\\n  ")}`;

  const handleStop = () => abortRef.current?.abort();

  const handleRun = async () => {
    if (!prompt.trim() || !routedModel || running) return;
    setRunning(true);
    setError("");
    setAnswer("");
    setReasoning("");
    setResult(null);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const start = Date.now();

    try {
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      if (pinnedConnectionId) headers["x-connection-id"] = pinnedConnectionId;
      if (stream) headers["Accept"] = "text/event-stream";

      const res = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify(buildBody()),
        signal: abortRef.current.signal,
      });
      const servedBy = res.headers.get("x-9router-model") || "";

      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch {}
        setError(parsed?.error?.message || parsed?.error || raw || `HTTP ${res.status}`);
        return;
      }

      // The gateway answers chat on text/event-stream even when stream:false, and
      // can glue `data: [DONE]` onto the JSON body — so read the body as frames
      // either way instead of trusting res.json().
      const reader = res.body?.getReader();
      if (!reader) {
        setError("Empty response body");
        return;
      }
      const decoder = new TextDecoder();
      let buffer = "";
      let raw = "";
      let text = "";
      let think = "";
      let usage = null;
      let finishReason = null;
      let servedModel = "";
      let firstTokenMs = null;
      const chunks = [];

      const absorb = (frame) => {
        chunks.push(frame);
        const piece = readChunk(frame);
        if (piece.usage) usage = piece.usage;
        if (piece.finishReason) finishReason = piece.finishReason;
        if (piece.model && !servedModel) servedModel = piece.model;
        if (piece.reasoning) { think += piece.reasoning; setReasoning(think); }
        if (piece.text) {
          if (firstTokenMs === null && stream) firstTokenMs = Date.now() - start;
          text += piece.text;
          setAnswer(text);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const decoded = decoder.decode(value, { stream: true });
        raw += decoded;
        buffer += decoded;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) {
          const frame = frameOf(line);
          if (frame) absorb(frame);
        }
      }
      const tail = frameOf(buffer);
      if (tail) absorb(tail);

      // Not SSE at all (plain, possibly pretty-printed JSON) — parse the whole body,
      // minus any terminator the gateway appended to it.
      if (chunks.length === 0 && raw.trim()) {
        const whole = stripDoneTerminator(raw);
        try { absorb(JSON.parse(whole)); } catch { /* falls through to the no-content notice */ }
      }

      setResult({
        data: chunks.length === 1 ? chunks[0] : chunks,
        latencyMs: Date.now() - start,
        firstTokenMs,
        usage,
        servedBy: servedBy || servedModel,
        finishReason,
      });
      if (!text && !think) setError("Provider returned no content");
    } catch (e) {
      if (e?.name === "AbortError") setError("Stopped");
      else setError(e.message || "Network error");
    } finally {
      setRunning(false);
    }
  };

  const inputClass = "w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary";
  const rawJson = result ? JSON.stringify(result.data, null, 2) : "";
  const usage = result?.usage;
  const hasOutput = !!(answer || reasoning || error);

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Playground</h2>
          <p className="text-xs text-text-muted">Run your own prompt against this provider through /v1/chat/completions.</p>
        </div>
        {displayModel && (
          <code className="max-w-full truncate rounded bg-sidebar px-1.5 py-0.5 font-mono text-xs text-text-muted">{displayModel}</code>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <FieldRow label="Model">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={selectedModel}
              onChange={(e) => setPickedModel(e.target.value)}
              className={`${inputClass} sm:flex-1`}
            >
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id}>{m.name && m.name !== m.id ? `${m.name} — ${m.id}` : m.id}</option>
              ))}
              <option value={MANUAL_MODEL}>Custom model id…</option>
            </select>
            {levelOptions && (
              <select
                value={effectiveLevel}
                onChange={(e) => setThinkingLevel(e.target.value)}
                title="Appends (level) to the model id"
                className={`${inputClass} sm:w-40`}
              >
                {levelOptions.map((l) => (
                  <option key={l} value={l}>{`Thinking: ${l.charAt(0).toUpperCase()}${l.slice(1)}`}</option>
                ))}
              </select>
            )}
          </div>
        </FieldRow>

        {isManual && (
          <FieldRow label="Model id">
            <input
              value={manualModel}
              onChange={(e) => setManualModel(e.target.value)}
              placeholder="model id as the provider names it"
              className={`${inputClass} font-mono`}
            />
          </FieldRow>
        )}

        <FieldRow label="Endpoint">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <span className="w-full min-w-0 flex-1 truncate rounded-lg bg-sidebar px-3 py-1.5 font-mono text-sm text-text-main">
              {baseUrl}/v1/chat/completions
            </span>
            {tunnelEndpoint && (
              <button
                onClick={() => setUseTunnel((v) => !v)}
                title={useTunnel ? "Using tunnel" : "Using local"}
                className={`flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                  useTunnel ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-text-muted hover:text-primary"
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">wifi_tethering</span>
                Tunnel
              </button>
            )}
          </div>
        </FieldRow>

        <FieldRow label="API Key">
          <span className="block truncate rounded-lg bg-sidebar px-3 py-1.5 font-mono text-sm text-text-main">
            {apiKey
              ? `${apiKey.slice(0, 8)}${"•".repeat(Math.min(20, Math.max(0, apiKey.length - 8)))}`
              : <span className="italic text-text-muted">No key configured</span>}
          </span>
        </FieldRow>

        {isFreeNoAuth && connections.length === 0 && (
          <FieldRow label="Connection">
            <span className="block rounded-lg bg-sidebar px-3 py-1.5 text-sm text-text-muted">
              Public — this provider needs no account
            </span>
          </FieldRow>
        )}

        {connections.length > 0 && (
          <FieldRow label="Connection">
            <select
              value={pinnedConnectionId}
              onChange={(e) => setPinnedConnectionId(e.target.value)}
              className={inputClass}
            >
              <option value="">Auto (by strategy)</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.email || c.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </FieldRow>
        )}
      </div>

      <div className="mt-2.5 flex flex-col gap-2.5">
        <FieldRow label="System" align="start">
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={2}
            placeholder="Optional system prompt"
            className={`${inputClass} resize-y`}
          />
        </FieldRow>

        <FieldRow label="Prompt" align="start">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); handleRun(); }
            }}
            rows={4}
            placeholder="Your prompt — ⌘/Ctrl + Enter to run"
            className={`${inputClass} resize-y`}
          />
        </FieldRow>

        <FieldRow label="Options">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              placeholder="temperature"
              className={`${inputClass} sm:w-40`}
            />
            <input
              type="number"
              min="1"
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              placeholder="max_tokens"
              className={`${inputClass} sm:w-40`}
            />
            <button
              onClick={() => setStream((v) => !v)}
              className={`flex shrink-0 items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                stream ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-text-muted hover:text-primary"
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">{stream ? "stream" : "block"}</span>
              Stream
            </button>
          </div>
        </FieldRow>

        {/* Request + Run */}
        <div className="mt-1">
          <div className="mb-1.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Request</span>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <button
                onClick={() => copyCurl(curlSnippet)}
                className="inline-flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-primary"
              >
                <span className="material-symbols-outlined text-[14px]">{copiedCurl ? "check" : "content_copy"}</span>
                {copiedCurl ? "Copied" : "Copy curl"}
              </button>
              {running && (
                <button
                  onClick={handleStop}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1 text-xs font-medium text-text-muted transition-colors hover:text-primary sm:w-auto"
                >
                  <span className="material-symbols-outlined text-[14px]">stop</span>
                  Stop
                </button>
              )}
              <button
                onClick={handleRun}
                disabled={running || !prompt.trim() || !routedModel}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                <span
                  className="material-symbols-outlined text-[14px]"
                  style={running ? { animation: "spin 1s linear infinite" } : undefined}
                >
                  {running ? "progress_activity" : "play_arrow"}
                </span>
                {running ? "Running..." : "Run"}
              </button>
            </div>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-sidebar px-3 py-2.5 font-mono text-xs text-text-main">{curlSnippet}</pre>
        </div>

        {error && <p className="break-words text-xs text-red-500">{error}</p>}

        {/* Response */}
        <div>
          <div className="mb-1.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
              Response
              {result && (
                <span className="font-normal normal-case">
                  ⚡ {result.latencyMs}ms
                  {result.firstTokenMs != null ? ` · first token ${result.firstTokenMs}ms` : ""}
                </span>
              )}
              {usage && (
                <span className="font-normal normal-case">
                  · {usage.prompt_tokens ?? "?"} in / {usage.completion_tokens ?? "?"} out
                </span>
              )}
              {result?.finishReason && <span className="font-normal normal-case">· {result.finishReason}</span>}
              {result?.servedBy && (
                <span className="font-normal normal-case">· served by <code className="font-mono">{result.servedBy}</code></span>
              )}
            </span>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              {result && (
                <button
                  onClick={() => setShowRaw((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-primary"
                >
                  <span className="material-symbols-outlined text-[14px]">{showRaw ? "visibility_off" : "data_object"}</span>
                  {showRaw ? "Hide raw" : "Raw JSON"}
                </button>
              )}
              {answer && (
                <button
                  onClick={() => copyAnswer(answer)}
                  className="inline-flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-primary"
                >
                  <span className="material-symbols-outlined text-[14px]">{copiedAnswer ? "check" : "content_copy"}</span>
                  {copiedAnswer ? "Copied" : "Copy"}
                </button>
              )}
            </div>
          </div>

          {reasoning && (
            <details open className="mb-2 rounded-lg border border-border bg-sidebar/50 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-text-muted">Reasoning</summary>
              <pre className="mt-1.5 whitespace-pre-wrap break-words font-mono text-xs text-text-muted">{reasoning}</pre>
            </details>
          )}

          <pre className={`overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-sidebar px-3 py-2.5 font-mono text-xs text-text-main ${hasOutput ? "" : "opacity-70"}`}>
            {answer || (running ? "…" : DEFAULT_RESPONSE_EXAMPLE)}
          </pre>

          {showRaw && result && (
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-sidebar px-3 py-2.5 font-mono text-xs text-text-muted">{rawJson}</pre>
          )}
        </div>
      </div>
    </Card>
  );
}

PlaygroundCard.propTypes = {
  providerId: PropTypes.string.isRequired,
  providerAlias: PropTypes.string.isRequired,
  providerDisplayAlias: PropTypes.string.isRequired,
  models: PropTypes.array,
  connections: PropTypes.array,
  isFreeNoAuth: PropTypes.bool,
};
