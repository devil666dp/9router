// Flatten an OpenAI chat body into the canonical input a recipe reads with
// "$.field" references.
//
// The engine always hands this executor an OpenAI-format body (custom-endpoint
// providers are unknown to the registry, so getTargetFormat falls back to
// "openai"). Recipes therefore only ever have to know ONE vocabulary, no matter
// what the client spoke.
//
// Canonical fields:
//   prompt        the last user turn's text
//   system        system/developer turns, joined
//   transcript    the whole conversation as "Role: text" lines
//   messages      the raw OpenAI messages array (for upstreams that accept it)
//   images        image URLs / data URIs found in the last user turn
//   files         non-image attachment URLs
//   model, stream, temperature, top_p, top_k, max_tokens, stop, seed,
//   presence_penalty, frequency_penalty, reasoning_effort
//
// Anything the recipe does not reference is simply never read.

const ROLE_LABELS = { user: "User", assistant: "Assistant", system: "System", developer: "System", tool: "Tool" };

/** Text out of a message whose content may be a string or an OpenAI part array. */
function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" || part?.type === "input_text" || typeof part?.text === "string")
    .map((part) => part.text || "")
    .join("")
    .trim();
}

/** Image URLs out of a message's content parts (URL and data-URI alike). */
function imagesOf(content) {
  if (!Array.isArray(content)) return [];
  const out = [];
  for (const part of content) {
    if (part?.type === "image_url") {
      const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
      if (url) out.push(url);
    } else if (part?.type === "input_image" && part.image_url) {
      out.push(typeof part.image_url === "string" ? part.image_url : part.image_url?.url);
    } else if (part?.type === "image" && part.source) {
      // Claude-shaped part that survived translation: rebuild a data URI.
      const { media_type: mediaType, data, url } = part.source;
      if (url) out.push(url);
      else if (data && mediaType) out.push(`data:${mediaType};base64,${data}`);
    }
  }
  return out.filter(Boolean);
}

function filesOf(content) {
  if (!Array.isArray(content)) return [];
  const out = [];
  for (const part of content) {
    if (part?.type === "file" || part?.type === "input_file") {
      const url = part.file_url || part.file?.file_url || part.file?.url;
      if (url) out.push(typeof url === "string" ? url : url?.url);
    }
  }
  return out.filter(Boolean);
}

/**
 * @param {object} body OpenAI chat-completions body
 * @param {string} model upstream model id (prefix already stripped)
 */
export function buildCanonicalInput(body = {}, model = "") {
  const messages = Array.isArray(body.messages) ? body.messages : [];

  const systemParts = [];
  const transcriptLines = [];
  let lastUser = null;

  for (const message of messages) {
    const role = message?.role;
    const text = textOf(message?.content);
    if (role === "system" || role === "developer") {
      if (text) systemParts.push(text);
      continue;
    }
    if (role === "user") lastUser = message;
    if (text) transcriptLines.push(`${ROLE_LABELS[role] || role}: ${text}`);
  }

  // A body with no user turn at all (rare, but combos and warmups produce it)
  // still needs a prompt, so fall back to the last message of any role.
  const promptSource = lastUser || messages[messages.length - 1] || null;

  return {
    prompt: textOf(promptSource?.content),
    system: systemParts.join("\n\n"),
    transcript: transcriptLines.join("\n"),
    messages,
    images: imagesOf(promptSource?.content),
    files: filesOf(promptSource?.content),
    model,
    stream: body.stream === true,
    temperature: body.temperature,
    top_p: body.top_p,
    top_k: body.top_k,
    max_tokens: body.max_tokens ?? body.max_completion_tokens,
    stop: body.stop,
    seed: body.seed,
    presence_penalty: body.presence_penalty,
    frequency_penalty: body.frequency_penalty,
    reasoning_effort: body.reasoning_effort,
  };
}
