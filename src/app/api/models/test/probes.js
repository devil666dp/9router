// Live capability probes: ask the upstream itself whether a model can read an
// image / PDF / audio / video, call a tool, or search the web — instead of
// trusting what getCapabilitiesForModel *declares*.
//
// Every probe goes back through this server's own /api/v1 surface, so it runs
// the real path (format translation, executor, account fallback) rather than a
// side channel that could pass where a real request would fail.
//
// Two guards would otherwise invalidate a probe, and both are opted out of with
// CAPABILITY_PROBE_HEADER (see chatCore.js and sse/handlers/chat.js):
//   • stripUnsupportedModalities would delete the fixture before it is sent
//     whenever the model *declares* the modality false — the probe would then
//     "fail" without the provider ever seeing the media.
//   • the capacity adapter would reroute the request to a pool model that does
//     support the modality, and its answer would be reported as this model's.
//
// Verdicts are three-valued. `supported: false` means the provider answered and
// the model demonstrably could not read/do it; `supported: null` means we could
// not tell (auth, rate limit, timeout, upstream 5xx). Only a matched readback
// yields `supported: true`.

import { PROBE_FIXTURES, fixtureDataUri } from "./probeFixtures.js";
import { getInternalHeaders, internalBaseUrl } from "./ping.js";
import { CAPABILITY_PROBE_HEADER } from "open-sse/config/runtimeConfig.js";
import { AI_PROVIDERS, resolveProviderId } from "@/shared/constants/providers";
// Shared with the dashboard so the buttons and the probes can't drift apart.
import { PROBE_CAPABILITIES } from "@/shared/constants/models";

export { PROBE_CAPABILITIES };

// Statuses that say nothing about the capability itself — credentials, quota,
// or the upstream being down. Anything else with a response is a real answer.
const INCONCLUSIVE_STATUS = new Set([401, 402, 403, 404, 407, 408, 409, 425, 429]);
const isInconclusive = (status) => !status || status >= 500 || INCONCLUSIVE_STATUS.has(status);

const READ_PROMPT =
  "This message contains one attachment holding a 4-digit number. Read it and reply with those 4 digits only — no words, no punctuation.";

const WORD_DIGITS = {
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};

// Reduce a reply to the digit sequence it contains, spelled-out numbers included
// ("six one nine two" → "6192"), so a chatty but correct answer still matches.
function digitsOf(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/g, (w) => WORD_DIGITS[w])
    .replace(/\D+/g, "");
}

// Flatten every place a provider might have put the answer: content (string or
// block array) plus the reasoning variants, since a thinking model that runs out
// of output budget can leave the digits in its reasoning field.
function answerText(message) {
  if (!message) return "";
  const parts = [];
  const c = message.content;
  if (typeof c === "string") parts.push(c);
  else if (Array.isArray(c)) {
    for (const b of c) {
      if (typeof b === "string") parts.push(b);
      else if (typeof b?.text === "string") parts.push(b.text);
    }
  }
  for (const k of ["reasoning", "reasoning_content", "thinking", "thinking_content"]) {
    if (typeof message[k] === "string") parts.push(message[k]);
  }
  return parts.join("\n");
}

// Same error precedence the /api/models/test ping uses, so failures read alike.
function errorDetail(parsed, rawText) {
  const detail = parsed?.error?.message || parsed?.msg || parsed?.message || parsed?.error || rawText;
  return detail ? String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 240) : "";
}

// One chat-completions call through the local /v1 surface with the probe header set.
async function chatProbe({ model, body, baseUrl, timeoutMs = 45000 }) {
  const headers = await getInternalHeaders();
  headers[CAPABILITY_PROBE_HEADER] = "1";
  const start = Date.now();

  let res;
  try {
    res = await fetch(`${baseUrl}/api/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, stream: false, ...body }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    return { latencyMs, status: null, inconclusive: true, error: timedOut ? `Timed out after ${timeoutMs}ms` : (err?.message || "Network error") };
  }

  const latencyMs = Date.now() - start;
  const rawText = await res.text().catch(() => "");
  let parsed = null;
  try { parsed = rawText ? JSON.parse(rawText) : null; } catch {}

  if (!res.ok) {
    const detail = errorDetail(parsed, rawText);
    return {
      latencyMs,
      status: res.status,
      inconclusive: isInconclusive(res.status),
      error: `HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
    };
  }

  // Some OpenAI-compatible gateways answer 200 with an error envelope.
  const providerStatus = parsed?.status;
  const hasProviderErrorStatus = providerStatus !== undefined && providerStatus !== null
    && String(providerStatus) !== "200" && String(providerStatus) !== "0";
  if (parsed?.error || (hasProviderErrorStatus && (parsed?.msg || parsed?.message))) {
    const detail = errorDetail(parsed, rawText);
    return { latencyMs, status: res.status, inconclusive: false, error: detail || "Provider returned an error" };
  }

  const choice = parsed?.choices?.[0];
  if (!choice) {
    return { latencyMs, status: res.status, inconclusive: false, error: "Provider returned no completion choices" };
  }
  return { latencyMs, status: res.status, inconclusive: false, parsed, choice, message: choice.message || {} };
}

// Media probes share one shape: send the fixture, expect its digits back.
async function readbackProbe({ model, baseUrl, block, expect, label }) {
  const r = await chatProbe({
    model,
    baseUrl,
    // Enough headroom for a reasoning model to think and still answer.
    body: { max_tokens: 1024, messages: [{ role: "user", content: [{ type: "text", text: READ_PROMPT }, block] }] },
  });
  if (r.error) return { supported: r.inconclusive ? null : false, latencyMs: r.latencyMs, status: r.status, error: r.error };

  const text = answerText(r.message);
  const digits = digitsOf(text);
  if (digits.includes(expect)) {
    return { supported: true, latencyMs: r.latencyMs, status: r.status, detail: `read ${expect} from the ${label}` };
  }
  const seen = text.trim().slice(0, 120) || "(empty reply)";
  return {
    supported: false,
    latencyMs: r.latencyMs,
    status: r.status,
    error: `Expected ${expect} from the ${label}, model replied: ${seen}`,
  };
}

// ── Individual probes ────────────────────────────────────────────────

// Image input. `image_url` with a data URI is the one shape every format
// understands (gemini → inlineData, claude → image, others pass it through).
function probeVision(model, baseUrl) {
  const f = PROBE_FIXTURES.image;
  return readbackProbe({
    model, baseUrl, expect: f.expect, label: "image",
    block: { type: "image_url", image_url: { url: fixtureDataUri(f) } },
  });
}

// PDF / document input. Sent as an OpenAI `file` block; openai-to-claude maps it
// to a Claude `document` and the gemini translator to inlineData.
function probePdf(model, baseUrl) {
  const f = PROBE_FIXTURES.pdf;
  return readbackProbe({
    model, baseUrl, expect: f.expect, label: "PDF",
    block: { type: "file", file: { filename: "probe.pdf", file_data: fixtureDataUri(f) } },
  });
}

// Audio input. The fixture is speech ("six one nine two"), so a model that
// merely sees the bytes cannot answer — it has to transcribe.
function probeAudioInput(model, baseUrl) {
  const f = PROBE_FIXTURES.audio;
  return readbackProbe({
    model, baseUrl, expect: f.expect, label: "audio",
    block: { type: "input_audio", input_audio: { data: f.b64, format: f.format } },
  });
}

// Video input. `video_url` is the shape Qwen-VL / dashscope-style upstreams take;
// the gemini translator turns a data URI into inlineData.
function probeVideoInput(model, baseUrl) {
  const f = PROBE_FIXTURES.video;
  return readbackProbe({
    model, baseUrl, expect: f.expect, label: "video",
    block: { type: "video_url", video_url: { url: fixtureDataUri(f) } },
  });
}

// Tool / function calling ("agent calling"). Asks for something only the tool can
// answer, then checks the reply actually carries a call to it.
const PROBE_TOOL = {
  type: "function",
  function: {
    name: "get_probe_code",
    description: "Returns the secret probe code for a room. The ONLY way to learn a room's code.",
    parameters: {
      type: "object",
      properties: { room: { type: "string", description: "Room name, e.g. \"atrium\"" } },
      required: ["room"],
    },
  },
};

async function probeTools(model, baseUrl) {
  const r = await chatProbe({
    model,
    baseUrl,
    body: {
      max_tokens: 1024,
      tools: [PROBE_TOOL],
      tool_choice: "auto",
      messages: [{ role: "user", content: "What is the secret probe code for the room named atrium? Use the tool." }],
    },
  });
  if (r.error) return { supported: r.inconclusive ? null : false, latencyMs: r.latencyMs, status: r.status, error: r.error };

  const calls = r.message?.tool_calls || [];
  const hit = calls.find((c) => (c?.function?.name || c?.name || "").includes("get_probe_code"));
  if (hit) {
    let room = "";
    try { room = JSON.parse(hit.function?.arguments || "{}")?.room || ""; } catch {}
    return {
      supported: true, latencyMs: r.latencyMs, status: r.status,
      detail: `called get_probe_code(${room ? `room="${room}"` : "…"})`,
    };
  }
  if (calls.length > 0) {
    return { supported: true, latencyMs: r.latencyMs, status: r.status, detail: `called ${calls.length} tool(s)` };
  }
  const seen = answerText(r.message).trim().slice(0, 120) || "(empty reply)";
  return {
    supported: false, latencyMs: r.latencyMs, status: r.status,
    error: `Accepted the tool but answered in text instead of calling it: ${seen}`,
  };
}

// Web search. Two different things can be true, so both are checked in order:
//   1. The provider is wired for search in the registry (searchConfig →
//      dedicated API, or searchViaChat → chat-completions wrapper). That is the
//      path /v1/search actually routes, so it is probed first and directly.
//   2. Otherwise the model may still carry a built-in web_search tool that
//      OpenAI-compatible upstreams accept inline. Ask a question no static
//      snapshot can answer and look for citations coming back.
const SEARCH_QUERY = "What did Anthropic announce most recently?";

// A reply that searched carries link metadata somewhere. Provider shapes differ
// (annotations[].url_citation, top-level citations[], gemini grounding chunks),
// so collect from all of them.
function citationUrls(parsed, message) {
  const urls = [];
  const push = (u) => { if (typeof u === "string" && /^https?:\/\//.test(u)) urls.push(u); };
  for (const a of message?.annotations || []) push(a?.url_citation?.url || a?.url);
  for (const c of parsed?.citations || message?.citations || []) push(typeof c === "string" ? c : c?.url);
  for (const ch of parsed?.groundingMetadata?.groundingChunks || []) push(ch?.web?.uri || ch?.web?.url);
  for (const r of parsed?.web_search_results || []) push(r?.url || r?.link);
  return [...new Set(urls)];
}

async function probeSearchViaEndpoint({ providerAlias, baseUrl }) {
  const headers = await getInternalHeaders();
  headers[CAPABILITY_PROBE_HEADER] = "1";
  const start = Date.now();

  let res;
  try {
    res = await fetch(`${baseUrl}/api/v1/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: providerAlias, query: SEARCH_QUERY, max_results: 3 }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    return { supported: null, latencyMs: Date.now() - start, status: null, error: timedOut ? "Search timed out after 30000ms" : (err?.message || "Network error") };
  }

  const latencyMs = Date.now() - start;
  const rawText = await res.text().catch(() => "");
  let parsed = null;
  try { parsed = rawText ? JSON.parse(rawText) : null; } catch {}

  if (!res.ok) {
    const detail = errorDetail(parsed, rawText);
    return { supported: isInconclusive(res.status) ? null : false, latencyMs, status: res.status, error: `HTTP ${res.status}${detail ? `: ${detail}` : ""}` };
  }
  const results = Array.isArray(parsed?.results) ? parsed.results : [];
  const answer = String(parsed?.answer?.text || "").trim();
  if (results.length > 0) {
    return { supported: true, latencyMs, status: res.status, detail: `/v1/search returned ${results.length} result(s), first: ${results[0]?.url || "(no url)"}` };
  }
  if (answer) {
    return { supported: true, latencyMs, status: res.status, detail: "/v1/search returned an answer with no citations" };
  }
  return { supported: false, latencyMs, status: res.status, error: "/v1/search returned no results" };
}

async function probeSearch(model, baseUrl) {
  // Provider-level wiring first — that is what /v1/search routes to.
  const alias = model.includes("/") ? model.slice(0, model.indexOf("/")) : model;
  const provider = AI_PROVIDERS[resolveProviderId(alias)];
  if (provider?.searchConfig || provider?.searchViaChat) {
    const viaEndpoint = await probeSearchViaEndpoint({ providerAlias: alias, baseUrl });
    // A wired provider that errors out is the answer; don't muddy it with a retry.
    if (viaEndpoint.supported !== false) return viaEndpoint;
  }

  // Built-in web_search tool inline on chat-completions.
  const r = await chatProbe({
    model,
    baseUrl,
    body: {
      max_tokens: 1024,
      tools: [{ type: "web_search" }],
      messages: [{ role: "user", content: `${SEARCH_QUERY} Search the web and cite your sources as URLs.` }],
    },
  });
  if (r.error) return { supported: r.inconclusive ? null : false, latencyMs: r.latencyMs, status: r.status, error: r.error };

  const urls = citationUrls(r.parsed, r.message);
  if (urls.length > 0) {
    return { supported: true, latencyMs: r.latencyMs, status: r.status, detail: `cited ${urls.length} source(s), first: ${urls[0]}` };
  }
  const calls = r.message?.tool_calls || [];
  if (calls.some((c) => /search/i.test(c?.function?.name || c?.name || ""))) {
    return { supported: true, latencyMs: r.latencyMs, status: r.status, detail: "model invoked a web-search tool" };
  }
  return {
    supported: false,
    latencyMs: r.latencyMs,
    status: r.status,
    error: "Answered without citing any source — no built-in web search",
  };
}

// ── Dispatch ─────────────────────────────────────────────────────────

const PROBE_FNS = {
  tools: probeTools,
  vision: probeVision,
  pdf: probePdf,
  audioInput: probeAudioInput,
  videoInput: probeVideoInput,
  search: probeSearch,
};

/**
 * Probe one capability against the live provider.
 * @param {string} capability one of PROBE_CAPABILITIES
 * @param {string} model provider-prefixed model id, e.g. "oai/gpt-4o"
 * @returns {Promise<{capability:string, supported:boolean|null, latencyMs:number, status:number|null, detail?:string, error?:string}>}
 */
export async function runProbe(capability, model, baseUrl = internalBaseUrl()) {
  const fn = PROBE_FNS[capability];
  if (!fn) {
    return { capability, supported: null, latencyMs: 0, status: null, error: `Unknown capability "${capability}"` };
  }
  try {
    const result = await fn(model, baseUrl);
    return { capability, ...result };
  } catch (err) {
    // A probe must never take the route down with it.
    return { capability, supported: null, latencyMs: 0, status: null, error: err?.message || "Probe failed" };
  }
}

/**
 * Probe every capability, sequentially — cheapest first, and one at a time so a
 * sweep doesn't trip the provider's rate limit and report false negatives.
 * @returns {Promise<{model:string, results:object, summary:{supported:string[], unsupported:string[], unknown:string[]}}>}
 */
export async function runAllProbes(model, baseUrl = internalBaseUrl()) {
  const results = {};
  const summary = { supported: [], unsupported: [], unknown: [] };

  for (const capability of PROBE_CAPABILITIES) {
    const result = await runProbe(capability, model, baseUrl);
    results[capability] = result;
    const bucket = result.supported === true ? "supported" : result.supported === false ? "unsupported" : "unknown";
    summary[bucket].push(capability);
  }

  return { model, results, summary };
}
