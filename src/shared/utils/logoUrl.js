// A provider node can carry its own logo, given as a URL, so an imported
// endpoint shows its real brand instead of the generic OpenAI/Anthropic icon or
// a two-letter badge.
//
// The URL is only ever put in an <img src>, so the browser fetches it, not the
// server — SSRF does not apply and a self-hosted/LAN logo host stays usable.
// What does matter is the scheme: anything but http(s) is refused so a stored
// value can never turn into a javascript:/data: payload.

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Trim and validate a user-supplied logo URL.
 * @returns {string} the URL, or "" when blank
 * @throws {Error} when non-blank but not an http(s) URL
 */
export function parseLogoUrl(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Logo URL must be a full URL, e.g. https://acme.ai/logo.png");
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error("Logo URL must start with http:// or https://");
  }
  return value;
}

/** Same check, but never throws — for rendering a stored value. */
export function safeLogoUrl(raw) {
  try {
    return parseLogoUrl(raw);
  } catch {
    return "";
  }
}
