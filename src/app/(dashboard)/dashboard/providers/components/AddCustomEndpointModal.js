"use client";

// Import a provider that speaks neither the OpenAI nor the Anthropic shape.
//
// It reads like Postman: paste the URL, keep or edit the headers, say whether a
// key is needed, and type the body. Pasting the provider's own curl fills all of
// that in at once. What 9router does afterwards — translating the reply into
// OpenAI, synthesizing a stream, polling a job — is not the user's problem and
// is not shown here.
//
// This sits BESIDE "Add OpenAI Compatible" / "Add Anthropic Compatible"; those
// remain the right choice whenever the upstream does speak a known format.

import { useState } from "react";
import PropTypes from "prop-types";
import { Badge, Button, CustomEndpointForm, Input, Modal } from "@/shared/components";
// Imported file-by-file, not via the barrel: the barrel also pulls in run.js →
// proxyFetch.js → node:stream, which must not reach the browser bundle.
import { specFromCurl } from "open-sse/handlers/customEndpoint/fromCurl.js";
import { validateSpec } from "open-sse/handlers/customEndpoint/spec.js";
import { emptyForm, formToSpec, specToForm, missingVars } from "open-sse/handlers/customEndpoint/form.js";

const CURL_PLACEHOLDER = `curl -X POST 'https://api.acme.ai/v1/chat' \\
  -H 'Authorization: Bearer YOUR_KEY' \\
  -d '{"model":"acme-1","prompt":"hello"}'`;

const MONO = "w-full rounded-[10px] bg-surface-2 border border-transparent p-2.5 text-sm font-mono text-text-main placeholder-text-muted/70 resize-y focus:outline-none focus:ring-2 focus:ring-brand-500/30";

function AddCustomEndpointModal({ isOpen, onClose, onCreated }) {
  const [form, setForm] = useState(emptyForm);
  const [curl, setCurl] = useState("");
  const [showCurl, setShowCurl] = useState(false);
  const [notes, setNotes] = useState([]);
  const [error, setError] = useState("");
  const [checkKey, setCheckKey] = useState("");
  const [checkModelId, setCheckModelId] = useState("");
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setForm(emptyForm());
    setCurl(""); setShowCurl(false); setNotes([]); setError("");
    setCheckKey(""); setCheckModelId(""); setResult(null);
  };

  // Keep the "your variables" rows in step with what the user typed in braces,
  // so a {workspace_id} anywhere in the form immediately asks for its value.
  const update = (next) => {
    const vars = missingVars(formToSpec(next), next.vars);
    setForm({ ...next, vars });
    setResult(null);
    setError("");
  };

  const handleImportCurl = () => {
    const { spec, notes: derived, errors } = specFromCurl(curl);
    if (!spec) {
      setError(errors.join("; ") || "Could not read that curl command");
      return;
    }
    const next = specToForm(spec, { name: form.name, prefix: form.prefix, logoUrl: form.logoUrl });
    update(next);
    setNotes(derived);
    setShowCurl(false);
  };

  const handleCheck = async () => {
    const spec = formToSpec(form);
    const problems = validateSpec(spec);
    if (problems.length) { setError(problems.join("; ")); return; }
    setError("");
    setValidating(true);
    try {
      const res = await fetch("/api/provider-nodes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "custom-endpoint",
          spec,
          apiKey: checkKey,
          modelId: checkModelId.trim() || undefined,
        }),
      });
      setResult(await res.json());
    } catch {
      setResult({ valid: false, error: "Network error" });
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async () => {
    const spec = formToSpec(form);
    const problems = validateSpec(spec);
    if (problems.length) { setError(problems.join("; ")); return; }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/provider-nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, prefix: form.prefix, logoUrl: form.logoUrl, type: "custom-endpoint", spec }),
      });
      const data = await res.json();
      if (res.ok) {
        onCreated(data.node);
        reset();
      } else {
        setError(data.error || "Failed to create provider");
      }
    } catch (createError) {
      setError(createError.message || "Failed to create provider");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = form.name.trim() && form.prefix.trim() && form.url.trim() && !submitting;

  return (
    <Modal isOpen={isOpen} title="Add Custom Endpoint" onClose={onClose} size="xl">
      <div className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-text-muted">
            For an API that is neither OpenAI- nor Anthropic-shaped. 9router translates
            the reply for you.
          </p>
          <Button size="sm" variant="secondary" onClick={() => setShowCurl((v) => !v)} className="shrink-0">
            {showCurl ? "Hide curl" : "Paste curl"}
          </Button>
        </div>

        {showCurl && (
          <div className="flex flex-col gap-2 rounded-[10px] bg-surface-2/50 p-3">
            <textarea
              className={`${MONO} min-h-[110px]`}
              placeholder={CURL_PLACEHOLDER}
              value={curl}
              onChange={(e) => setCurl(e.target.value)}
              spellCheck={false}
            />
            <Button size="sm" onClick={handleImportCurl} disabled={!curl.trim()} className="self-start">
              Fill the form from this
            </Button>
          </div>
        )}

        {notes.length > 0 && (
          <ul className="flex flex-col gap-0.5 text-xs text-text-muted">
            {notes.map((note) => <li key={note}>• {note}</li>)}
          </ul>
        )}

        <CustomEndpointForm form={form} onChange={update} />

        <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="API key (to test)"
              type="password"
              value={checkKey}
              onChange={(e) => setCheckKey(e.target.value)}
              hint="Not saved — add it when you connect an account."
            />
            <Input
              label="Model to test with"
              value={checkModelId}
              onChange={(e) => setCheckModelId(e.target.value)}
              placeholder="acme-1"
              hint="Fills in {model}."
            />
          </div>
          <div className="flex items-start gap-3">
            <Button onClick={handleCheck} disabled={validating || !form.url.trim()} variant="secondary">
              {validating ? "Testing..." : "Test call"}
            </Button>
            {result && (
              <div className="flex flex-col gap-1 min-w-0">
                <Badge variant={result.valid ? "success" : "error"}>
                  {result.valid ? "Works" : "Failed"}
                </Badge>
                <span className={`text-xs break-words ${result.valid ? "text-text-muted font-mono" : "text-red-500"}`}>
                  {result.valid ? result.preview : result.error}
                </span>
              </div>
            )}
          </div>
        </div>

        {error && <p className="text-xs text-red-500 break-words">{error}</p>}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={handleSubmit} fullWidth disabled={!canSubmit}>
            {submitting ? "Creating..." : "Create"}
          </Button>
          <Button onClick={onClose} variant="ghost" fullWidth>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

AddCustomEndpointModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onCreated: PropTypes.func.isRequired,
};

export default AddCustomEndpointModal;
