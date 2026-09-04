"use client";

// Edit an already-imported custom endpoint in the same form that created it.
//
// Round-tripping through form.js means what the user sees here is what they
// typed on import — including the {braces} they can now change — rather than the
// stored JSON. That is the point of the request: variable values are editable on
// the detail page.

import { useState } from "react";
import PropTypes from "prop-types";
import { Badge, Button, CustomEndpointForm, Input, Modal } from "@/shared/components";
// Imported file-by-file, not via the barrel: the barrel also pulls in run.js →
// proxyFetch.js → node:stream, which must not reach the browser bundle.
import { validateSpec } from "open-sse/handlers/customEndpoint/spec.js";
import { formToSpec, specToForm, missingVars } from "open-sse/handlers/customEndpoint/form.js";

export default function EditCustomEndpointNodeModal({ isOpen, node, onSave, onClose }) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [checkKey, setCheckKey] = useState("");
  const [checkModelId, setCheckModelId] = useState("");
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState(null);

  // Load the node's current values whenever the modal opens (and if it is
  // pointed at a different node). Done during render rather than in an effect —
  // the effect form triggers a cascading second render on every open.
  const loadKey = node ? `${node.id}:${isOpen}` : null;
  const [loadedKey, setLoadedKey] = useState(null);
  if (isOpen && loadKey && loadKey !== loadedKey) {
    setLoadedKey(loadKey);
    const loaded = specToForm(node.spec, { name: node.name || "", prefix: node.prefix || "", logoUrl: node.logoUrl || "" });
    setForm({ ...loaded, vars: missingVars(node.spec || {}, loaded.vars) });
    setError("");
    setResult(null);
  }

  const update = (next) => {
    setForm({ ...next, vars: missingVars(formToSpec(next), next.vars) });
    setResult(null);
    setError("");
  };

  const checked = () => {
    const spec = formToSpec(form);
    const problems = validateSpec(spec);
    if (problems.length) { setError(problems.join("; ")); return null; }
    setError("");
    return spec;
  };

  const handleValidate = async () => {
    const spec = checked();
    if (!spec) return;
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
    const spec = checked();
    if (!spec) return;
    setSaving(true);
    try {
      await onSave({ name: form.name.trim(), prefix: form.prefix.trim(), logoUrl: form.logoUrl.trim(), spec });
    } finally {
      setSaving(false);
    }
  };

  if (!node || !form) return null;

  return (
    <Modal isOpen={isOpen} title="Edit Custom Endpoint" onClose={onClose} size="xl">
      <div className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">
        <CustomEndpointForm form={form} onChange={update} />

        <p className="text-xs text-text-muted">
          Existing connections follow a prefix change.
        </p>

        <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="API key (to test)"
              type="password"
              value={checkKey}
              onChange={(e) => setCheckKey(e.target.value)}
              hint="Not saved — this only runs the test below."
            />
            <Input
              label="Model to test with"
              value={checkModelId}
              onChange={(e) => setCheckModelId(e.target.value)}
              hint="Fills in {model}."
            />
          </div>
          <div className="flex items-start gap-3">
            <Button onClick={handleValidate} disabled={validating || !form.url.trim()} variant="secondary">
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

        {!!error && <p className="text-xs text-red-500 break-words">{error}</p>}

        <div className="flex gap-2">
          <Button
            onClick={handleSubmit}
            fullWidth
            disabled={!form.name.trim() || !form.prefix.trim() || !form.url.trim() || saving}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button onClick={onClose} variant="ghost" fullWidth>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

EditCustomEndpointNodeModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  node: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    prefix: PropTypes.string,
    logoUrl: PropTypes.string,
    spec: PropTypes.object,
  }),
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
