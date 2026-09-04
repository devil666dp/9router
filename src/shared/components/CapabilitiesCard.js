"use client";

import { useCallback, useMemo, useState } from "react";
import PropTypes from "prop-types";
import Card from "./Card";
import FieldRow from "./FieldRow";
import { CAPACITY_META, PROBE_CAPABILITIES } from "@/shared/constants/models";

// Verify a model's capabilities against the live provider instead of trusting
// what the registry declares. Each row fires one probe at
// POST /api/models/test { model, capability } and shows what came back —
// verdict, latency, and the provider's own words on a failure.
const MANUAL_MODEL = "__manual__";

const VERDICT = {
  true: { icon: "check_circle", label: "Supported", chip: "border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400" },
  false: { icon: "cancel", label: "Not supported", chip: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400" },
  // Auth, rate limit, timeout or a 5xx says nothing about the capability itself.
  null: { icon: "help", label: "Couldn't tell", chip: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
};
const verdictOf = (result) => VERDICT[String(result?.supported)] || VERDICT.null;

const WHAT_IT_PROVES = {
  tools: "Sends one function and asks a question only the tool can answer.",
  vision: "Sends a PNG with a 4-digit number drawn in it and asks for the digits.",
  pdf: "Sends a one-page PDF with a 4-digit number and asks for the digits.",
  audioInput: "Sends 1s of speech saying four digits and asks for them back.",
  videoInput: "Sends a 1s MP4 showing four digits and asks for them back.",
  search: "Asks something no snapshot can answer, then looks for citations.",
};

function CapabilityRow({ capability, result, running, declared, disabled, onTest }) {
  const meta = CAPACITY_META[capability] || {};
  const verdict = result ? verdictOf(result) : null;
  const message = result?.detail || result?.error || "";
  // A declared cap the live provider contradicts is the interesting case.
  const mismatch = result && result.supported !== null && declared !== undefined && declared !== result.supported;

  return (
    <div className="flex flex-col gap-2 border-b border-border px-3 py-2.5 last:border-b-0 sm:flex-row sm:items-start sm:gap-3">
      <span className={`material-symbols-outlined mt-0.5 shrink-0 text-[18px] ${meta.color || "text-text-muted"}`}>
        {meta.icon || "help"}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{meta.label || capability}</span>
          {declared !== undefined && (
            <span className="rounded border border-border px-1 py-px text-[10px] text-text-muted">
              declared {declared ? "yes" : "no"}
            </span>
          )}
          {verdict && (
            <span className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-px text-[10px] font-medium ${verdict.chip}`}>
              <span className="material-symbols-outlined leading-none" style={{ fontSize: "12px" }}>{verdict.icon}</span>
              {verdict.label}
            </span>
          )}
          {result?.latencyMs ? <span className="text-[10px] text-text-muted">{result.latencyMs}ms</span> : null}
          {result?.status ? <span className="text-[10px] text-text-muted">HTTP {result.status}</span> : null}
          {mismatch && (
            <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1 py-px text-[10px] text-amber-600 dark:text-amber-400">
              disagrees with the registry
            </span>
          )}
        </div>

        {/* Error text in full — this is the whole point of running the probe. */}
        <p className={`mt-0.5 break-words text-xs ${result?.error ? "text-red-500" : "text-text-muted"}`}>
          {running ? "Asking the provider…" : message || WHAT_IT_PROVES[capability] || ""}
        </p>
      </div>

      <button
        type="button"
        onClick={onTest}
        disabled={disabled || running}
        className="flex shrink-0 items-center justify-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          className="material-symbols-outlined"
          style={running ? { fontSize: "14px", animation: "spin 1s linear infinite" } : { fontSize: "14px" }}
        >
          {running ? "progress_activity" : "science"}
        </span>
        {running ? "Testing…" : result ? "Retest" : "Test"}
      </button>
    </div>
  );
}

CapabilityRow.propTypes = {
  capability: PropTypes.string.isRequired,
  result: PropTypes.object,
  running: PropTypes.bool,
  declared: PropTypes.bool,
  disabled: PropTypes.bool,
  onTest: PropTypes.func.isRequired,
};

export default function CapabilitiesCard({
  providerAlias,
  providerDisplayAlias,
  models = [],
  getCaps,
  canTest = true,
  disabledReason = "",
}) {
  const modelOptions = useMemo(() => models.filter((m) => m?.id), [models]);
  // Empty = not chosen yet; derive the first option so a late-arriving model
  // list (imported customs, cursor live models) still lands on a real model.
  const [pickedModel, setPickedModel] = useState("");
  const [manualModel, setManualModel] = useState("");
  // Results are keyed by model id, so switching models doesn't discard a sweep.
  const [resultsByModel, setResultsByModel] = useState({});
  const [running, setRunning] = useState(() => new Set());
  const [sweeping, setSweeping] = useState(false);

  const selectedModel = pickedModel || modelOptions[0]?.id || MANUAL_MODEL;
  const isManual = selectedModel === MANUAL_MODEL;
  const modelId = (isManual ? manualModel : selectedModel).trim();
  const routedModel = modelId ? `${providerAlias}/${modelId}` : "";
  const displayModel = modelId ? `${providerDisplayAlias || providerAlias}/${modelId}` : "";
  const caps = getCaps && modelId ? getCaps(routedModel) : null;
  const results = resultsByModel[modelId] || {};
  const ready = canTest && !!modelId;

  const probe = useCallback(async (capability, model) => {
    const key = `${model}:${capability}`;
    setRunning((prev) => new Set(prev).add(key));
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: `${providerAlias}/${model}`, capability }),
      });
      const data = await res.json().catch(() => null);
      // A 400 from the route carries `error` but no verdict — show it as unknown.
      const result = data && "supported" in data
        ? data
        : { supported: null, error: data?.error || `HTTP ${res.status}` };
      setResultsByModel((prev) => ({ ...prev, [model]: { ...(prev[model] || {}), [capability]: result } }));
      return result;
    } catch (err) {
      const result = { supported: null, error: err?.message || "Request failed" };
      setResultsByModel((prev) => ({ ...prev, [model]: { ...(prev[model] || {}), [capability]: result } }));
      return result;
    } finally {
      setRunning((prev) => { const next = new Set(prev); next.delete(key); return next; });
    }
  }, [providerAlias]);

  const probeAll = useCallback(async () => {
    if (!modelId) return;
    setSweeping(true);
    try {
      // Sequential on purpose: parallel probes trip provider rate limits, and
      // the 429s would come back as "couldn't tell" for capabilities that work.
      for (const capability of PROBE_CAPABILITIES) await probe(capability, modelId);
    } finally {
      setSweeping(false);
    }
  }, [modelId, probe]);

  const tested = PROBE_CAPABILITIES.filter((c) => results[c]);
  const tally = {
    supported: tested.filter((c) => results[c].supported === true).length,
    unsupported: tested.filter((c) => results[c].supported === false).length,
    unknown: tested.filter((c) => results[c].supported === null).length,
  };
  const inputClass = "w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary";

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Capabilities</h2>
          <p className="text-xs text-text-muted">
            Ask the provider itself what a model can do — image, PDF, audio and video input, tool calling, web search.
          </p>
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
            <button
              type="button"
              onClick={probeAll}
              disabled={!ready || sweeping || running.size > 0}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              <span
                className="material-symbols-outlined"
                style={sweeping ? { fontSize: "14px", animation: "spin 1s linear infinite" } : { fontSize: "14px" }}
              >
                {sweeping ? "progress_activity" : "play_arrow"}
              </span>
              {sweeping ? "Testing all…" : "Test all"}
            </button>
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
      </div>

      {!canTest && (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          {disabledReason || "Add a connection to run capability tests."}
        </p>
      )}

      <div className="mt-3 rounded-lg border border-border">
        {PROBE_CAPABILITIES.map((capability) => (
          <CapabilityRow
            key={capability}
            capability={capability}
            result={results[capability]}
            running={running.has(`${modelId}:${capability}`)}
            declared={caps ? caps[capability] === true : undefined}
            disabled={!ready || sweeping}
            onTest={() => probe(capability, modelId)}
          />
        ))}
      </div>

      {tested.length > 0 && (
        <p className="mt-2 text-xs text-text-muted">
          {tested.length}/{PROBE_CAPABILITIES.length} tested — {tally.supported} supported, {tally.unsupported} not supported
          {tally.unknown ? `, ${tally.unknown} inconclusive` : ""}. A probe only says “supported” when the model read the
          fixture back, so an inconclusive result means the request never reached the model.
        </p>
      )}
    </Card>
  );
}

CapabilitiesCard.propTypes = {
  providerAlias: PropTypes.string.isRequired,
  providerDisplayAlias: PropTypes.string,
  models: PropTypes.array,
  getCaps: PropTypes.func,
  canTest: PropTypes.bool,
  disabledReason: PropTypes.string,
};
