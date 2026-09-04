"use client";

// The Postman-style editor for a custom endpoint.
//
// One screen, in the order a person thinks: what to call it, where to send the
// request, what headers, what key, what body. Everything else the runtime needs
// (how to translate the reply into OpenAI, how to stream it, how to poll) is
// derived — the user never sees a "recipe".
//
// Shared by the Add modal and the provider page's Edit modal so both edit the
// exact same fields, and neither can drift from the other.

import PropTypes from "prop-types";
// Sibling files, not the barrel: this component IS in the barrel.
import Input from "./Input";
import LogoUrlInput from "./LogoUrlInput";
import Select from "./Select";
// form.js is pure data (spec.js + template.js only) — no node imports reach the bundle.
import { AUTO_VARS } from "open-sse/handlers/customEndpoint/form.js";

const METHODS = [
  { value: "POST", label: "POST" },
  { value: "GET", label: "GET" },
  { value: "PUT", label: "PUT" },
  { value: "PATCH", label: "PATCH" },
];

const SECOND_CALL_TABS = [
  ["off", "None"],
  ["poll", "Poll"],
  ["stream", "Stream"],
];

const AUTH_OPTIONS = [
  { value: "bearer", label: "Bearer token (default)" },
  { value: "header", label: "Custom header" },
  { value: "none", label: "No auth" },
];

const MONO = "w-full rounded-[10px] bg-surface-2 border border-transparent p-2.5 text-sm font-mono text-text-main placeholder-text-muted/70 resize-y focus:outline-none focus:ring-2 focus:ring-brand-500/30";
const CELL = "flex-1 min-w-0 rounded-[8px] bg-surface-2 border border-transparent px-2.5 py-2 text-sm font-mono text-text-main placeholder-text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand-500/30";

/** The variables a request always fills in, shown as a hint under the body. */
const AUTO_VAR_HINT = [...AUTO_VARS].filter((v) => v !== "id").map((v) => `{${v}}`).join(" ");

function Rows({ rows, keyField, keyPlaceholder, valuePlaceholder, onChange, addLabel }) {
  const set = (index, patch) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const remove = (index) => onChange(rows.filter((_, i) => i !== index));
  const add = () => onChange([...rows, { [keyField]: "", value: "" }]);

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, index) => (
        // Index-keyed on purpose: these rows are positional and freely renamed,
        // so a value-derived key would remount the input on every keystroke.
        <div key={index} className="flex items-center gap-1.5">
          <input
            className={CELL}
            placeholder={keyPlaceholder}
            value={row[keyField] ?? ""}
            onChange={(e) => set(index, { [keyField]: e.target.value })}
            spellCheck={false}
          />
          <input
            className={CELL}
            placeholder={valuePlaceholder}
            value={row.value ?? ""}
            onChange={(e) => set(index, { value: e.target.value })}
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => remove(index)}
            aria-label="Remove row"
            className="shrink-0 h-8 w-8 grid place-items-center rounded-[8px] text-text-muted hover:bg-surface-2 hover:text-text-main"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="self-start text-xs text-brand-500 hover:underline"
      >
        + {addLabel}
      </button>
    </div>
  );
}

Rows.propTypes = {
  rows: PropTypes.array.isRequired,
  keyField: PropTypes.string.isRequired,
  keyPlaceholder: PropTypes.string,
  valuePlaceholder: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  addLabel: PropTypes.string.isRequired,
};

function Section({ title, children, hint }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-text-main">{title}</span>
        {hint && <span className="text-xs text-text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

Section.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node,
  hint: PropTypes.string,
};

/**
 * @param {object} props.form   the form state (see form.js emptyForm())
 * @param {Function} props.onChange  receives a patch to merge
 * @param {boolean} props.showIdentity  name + prefix + logo (hidden when editing them elsewhere)
 */
export default function CustomEndpointForm({ form, onChange, showIdentity = true }) {
  const patch = (next) => onChange({ ...form, ...next });

  return (
    <div className="flex flex-col gap-4">
      {showIdentity && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Acme AI"
              required
            />
            <Input
              label="Prefix"
              value={form.prefix}
              onChange={(e) => patch({ prefix: e.target.value })}
              placeholder="acme"
              hint="Call it as prefix/model"
              required
            />
          </div>
          <LogoUrlInput
            value={form.logoUrl}
            onChange={(e) => patch({ logoUrl: e.target.value })}
            fallbackText="CE"
            fallbackColor="#7C6BF2"
          />
        </>
      )}

      <Section title="Request" hint="Paste the URL from the provider's curl">
        <div className="flex gap-1.5">
          <Select
            options={METHODS}
            value={form.method}
            onChange={(e) => patch({ method: e.target.value })}
            className="w-[110px] shrink-0"
          />
          <input
            className={CELL}
            placeholder="https://api.acme.ai/v1/chat"
            value={form.url}
            onChange={(e) => patch({ url: e.target.value })}
            spellCheck={false}
          />
        </div>
      </Section>

      <Section title="Headers">
        <Rows
          rows={form.headers}
          keyField="name"
          keyPlaceholder="Content-Type"
          valuePlaceholder="application/json"
          onChange={(headers) => patch({ headers })}
          addLabel="Add header"
        />
      </Section>

      <Section title="Auth">
        <Select
          options={AUTH_OPTIONS}
          value={form.authMode}
          onChange={(e) => patch({ authMode: e.target.value })}
        />
        {form.authMode === "header" && (
          <Input
            value={form.authHeader}
            onChange={(e) => patch({ authHeader: e.target.value })}
            placeholder="x-api-key"
            hint="The key is sent as this header's whole value."
          />
        )}
        {form.authMode === "bearer" && (
          <p className="text-xs text-text-muted">
            Sent as <code className="font-mono">Authorization: Bearer &lt;key&gt;</code>. The key
            itself is added when you connect an account.
          </p>
        )}
      </Section>

      {form.method !== "GET" && (
        <Section title="Body">
          <div className="inline-flex self-start items-center p-1 rounded-[10px] bg-surface-2">
            {[["fields", "Key / value"], ["json", "Raw JSON"]].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => patch({ bodyMode: mode })}
                className={`px-3 h-7 text-xs font-medium rounded-[8px] transition-all ${
                  form.bodyMode === mode ? "bg-surface text-text-main shadow-sm" : "text-text-muted hover:text-text-main"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {form.bodyMode === "fields" ? (
            <Rows
              rows={form.bodyFields}
              keyField="key"
              keyPlaceholder="prompt"
              valuePlaceholder="{prompt}"
              onChange={(bodyFields) => patch({ bodyFields })}
              addLabel="Add field"
            />
          ) : (
            <textarea
              className={`${MONO} min-h-[140px]`}
              placeholder={'{\n  "input": { "prompt": "{prompt}" }\n}'}
              value={form.bodyJson}
              onChange={(e) => patch({ bodyJson: e.target.value })}
              spellCheck={false}
            />
          )}

          <p className="text-xs text-text-muted">
            Anything in braces is filled in per request: <code className="font-mono">{AUTO_VAR_HINT}</code>
          </p>
        </Section>
      )}

      {form.vars.length > 0 && (
        <Section title="Your variables" hint="Used anywhere you wrote them in braces">
          <Rows
            rows={form.vars}
            keyField="name"
            keyPlaceholder="workspace_id"
            valuePlaceholder="value"
            onChange={(vars) => patch({ vars })}
            addLabel="Add variable"
          />
        </Section>
      )}

      <Section
        title="Second call"
        hint={form.secondCall === "off" ? "Only if one request is not enough" : "{id} comes from the first reply"}
      >
        <div className="inline-flex self-start items-center p-1 rounded-[10px] bg-surface-2">
          {SECOND_CALL_TABS.map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => patch({ secondCall: mode })}
              className={`px-3 h-7 text-xs font-medium rounded-[8px] transition-all ${
                form.secondCall === mode ? "bg-surface text-text-main shadow-sm" : "text-text-muted hover:text-text-main"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {form.secondCall === "off" ? (
          <p className="text-xs text-text-muted">
            The first response already carries the answer.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-text-muted">
              {form.secondCall === "stream"
                ? "One request, read until it ends — Gradio, SSE and NDJSON endpoints work this way."
                : "Asked again until it reports finished."}
            </p>

            <div className="flex gap-1.5">
              <Select
                options={METHODS}
                value={form.pollMethod}
                onChange={(e) => patch({ pollMethod: e.target.value })}
                className="w-[110px] shrink-0"
              />
              <input
                className={CELL}
                placeholder="https://api.acme.ai/v1/runs/{id}"
                value={form.pollUrl}
                onChange={(e) => patch({ pollUrl: e.target.value })}
                spellCheck={false}
              />
            </div>

            {form.pollMethod !== "GET" && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-text-muted">Body</span>
                <Rows
                  rows={form.pollFields}
                  keyField="key"
                  keyPlaceholder="requestid"
                  valuePlaceholder="{id}"
                  onChange={(pollFields) => patch({ pollFields })}
                  addLabel="Add field"
                />
              </div>
            )}

            <Input
              label="Where the reply text is"
              value={form.pollTextPath}
              onChange={(e) => patch({ pollTextPath: e.target.value })}
              placeholder={form.secondCall === "stream" ? "$[0]" : "$.output.text"}
              hint="Leave empty to take the whole reply."
            />

            {form.secondCall === "poll" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Status field"
                  value={form.pollStatusPath}
                  onChange={(e) => patch({ pollStatusPath: e.target.value })}
                  placeholder="$.status"
                  hint="Optional — without it, 9router waits for the text."
                />
                <Input
                  label="Means finished"
                  value={form.pollDoneValues}
                  onChange={(e) => patch({ pollDoneValues: e.target.value })}
                  placeholder="completed, succeeded"
                />
              </div>
            )}

            <Input
              label="Where the job ID is in the first reply"
              value={form.idPath}
              onChange={(e) => patch({ idPath: e.target.value })}
              placeholder="$.requestid"
              hint="Optional — 9router finds runId / id / requestid on its own."
            />
          </div>
        )}
      </Section>

      {form.secondCall === "off" && (
        <Section title="Response">
          <Input
            label="Where the reply text is"
            value={form.textPath}
            onChange={(e) => patch({ textPath: e.target.value })}
            placeholder="$.output.content"
            hint="Leave empty to take the whole reply. Everything else — OpenAI shape, streaming — 9router handles."
          />
        </Section>
      )}
    </div>
  );
}

CustomEndpointForm.propTypes = {
  form: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  showIdentity: PropTypes.bool,
};
