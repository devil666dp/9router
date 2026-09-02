/**
 * Proxy pool types — one list shared by the dashboard, the proxy-pools API and
 * runtime proxy resolution.
 *
 * Relay platforms all speak the same header spec (`x-relay-target` /
 * `x-relay-path`), so `type` only decides how a pool is presented, validated
 * and health-checked — never how the request is dispatched. Nothing about a
 * relay pool depends on 9router having been the thing that deployed it, so a
 * relay URL can be registered by hand exactly like an HTTP proxy.
 */
export const PROXY_POOL_TYPES = [
  {
    value: "http",
    label: "HTTP Proxy",
    icon: "lan",
    iconClassName: "text-text-muted",
    isRelay: false,
    urlLabel: "Proxy URL",
    urlPlaceholder: "http://127.0.0.1:7897",
    urlHint: "",
    noProxyHint: "Comma-separated hosts/domains to bypass proxy",
    importPlaceholder: "http://user:pass@127.0.0.1:7897\n127.0.0.1:7897:user:pass",
    importHint: "Supported formats: protocol://user:pass@host:port, host:port:user:pass",
    strictHint: "Fail request if proxy is unreachable instead of falling back to direct.",
  },
  {
    value: "vercel",
    label: "Vercel Relay",
    badge: "vercel relay",
    icon: "cloud_upload",
    iconClassName: "text-blue-500",
    isRelay: true,
    hostSuffixes: [".vercel.app"],
    urlLabel: "Relay URL",
    urlPlaceholder: "https://my-relay.vercel.app",
  },
  {
    value: "cloudflare",
    label: "Cloudflare Relay",
    badge: "cloudflare relay",
    icon: "cloud",
    iconClassName: "text-orange-500",
    isRelay: true,
    hostSuffixes: [".workers.dev"],
    urlLabel: "Relay URL",
    urlPlaceholder: "https://my-relay.my-account.workers.dev",
  },
  {
    value: "deno",
    label: "Deno Relay",
    badge: "deno relay",
    icon: "terminal",
    iconClassName: "text-green-500",
    isRelay: true,
    hostSuffixes: [".deno.net", ".deno.dev"],
    urlLabel: "Relay URL",
    urlPlaceholder: "https://my-relay.my-org.deno.net",
  },
];

export const DEFAULT_PROXY_POOL_TYPE = "http";

export const PROXY_POOL_TYPE_VALUES = PROXY_POOL_TYPES.map((entry) => entry.value);

export const RELAY_PROXY_POOL_TYPES = PROXY_POOL_TYPES.filter((entry) => entry.isRelay);

const BY_VALUE = new Map(PROXY_POOL_TYPES.map((entry) => [entry.value, entry]));

const RELAY_URL_LABEL = "Relay URL";

const RELAY_URL_HINT =
  "The deployed relay endpoint that forwards x-relay-target / x-relay-path — paste it here to use a relay you deployed yourself.";

const RELAY_NO_PROXY_HINT = "Comma-separated hosts/domains to send direct instead of through the relay";

const RELAY_STRICT_HINT = "Fail request if the relay is unreachable instead of falling back to direct.";

const RELAY_IMPORT_PLACEHOLDER = "https://my-relay.vercel.app\nhttps://my-relay.my-account.workers.dev";

const RELAY_IMPORT_HINT =
  "One relay URL per line. The platform is read from the hostname (*.vercel.app, *.workers.dev, *.deno.net) and falls back to the type selected above.";

/** Look up a type descriptor; unknown values fall back to the plain HTTP proxy. */
export function getProxyPoolType(type) {
  const entry = BY_VALUE.get(type) || BY_VALUE.get(DEFAULT_PROXY_POOL_TYPE);
  if (!entry.isRelay) return entry;
  return {
    urlLabel: RELAY_URL_LABEL,
    urlHint: RELAY_URL_HINT,
    noProxyHint: RELAY_NO_PROXY_HINT,
    importPlaceholder: RELAY_IMPORT_PLACEHOLDER,
    importHint: RELAY_IMPORT_HINT,
    strictHint: RELAY_STRICT_HINT,
    ...entry,
  };
}

export function normalizeProxyPoolType(type) {
  return BY_VALUE.has(type) ? type : DEFAULT_PROXY_POOL_TYPE;
}

/** Relay pools are dispatched through relay headers, not an HTTP proxy agent. */
export function isRelayProxyType(type) {
  return getProxyPoolType(type).isRelay === true;
}

function parseHttpUrl(url) {
  const value = typeof url === "string" ? url.trim() : "";
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * A relay URL is fetched as-is, so it has to be an absolute http(s) URL.
 * Embedded credentials are rejected here rather than at request time, where
 * `fetch` throws on them ("cannot be constructed from a URL that includes
 * credentials") — an HTTP proxy URL pasted under a relay type is the likely
 * way to get one.
 */
export function isValidRelayUrl(url) {
  const parsed = parseHttpUrl(url);
  return parsed !== null && !parsed.username && !parsed.password;
}

/** Keep imported relay URLs in the same shape the deploy routes store. */
export function normalizeRelayUrl(url) {
  const value = typeof url === "string" ? url.trim() : "";
  return value.replace(/\/+$/, "");
}

/**
 * Recognise a relay platform from its first-party hostname. None of these
 * suffixes can host an HTTP CONNECT proxy, so a match is always a relay rather
 * than a proxy URL — which is what makes detection safe to trust over the
 * type the user happened to pick.
 */
export function detectRelayType(url) {
  const parsed = parseHttpUrl(url);
  if (!parsed) return null;

  const hostname = parsed.hostname.toLowerCase();
  for (const entry of RELAY_PROXY_POOL_TYPES) {
    if ((entry.hostSuffixes || []).some((suffix) => hostname.endsWith(suffix))) return entry.value;
  }
  return null;
}

/**
 * Validate and canonicalise a URL against the pool type it is stored under.
 * Relay URLs are fetched directly, so they must be absolute http(s) with no
 * embedded credentials; proxy URLs go to undici's ProxyAgent, which also takes
 * bare `host:port`, so they are left as typed.
 */
export function normalizeProxyUrlForType(proxyUrl, type) {
  if (!isRelayProxyType(type)) return { proxyUrl };

  const descriptor = getProxyPoolType(type);
  if (!isValidRelayUrl(proxyUrl)) {
    return { error: `${descriptor.label} needs a full relay URL, e.g. ${descriptor.urlPlaceholder}` };
  }

  return { proxyUrl: normalizeRelayUrl(proxyUrl) };
}

/**
 * Name an imported relay the way the deploy routes do — after its subdomain.
 * Returns "" for a dotless hostname, so a URL still being typed does not get
 * named after a half-finished host ("https://my-rel" → "").
 */
export function relayNameFromUrl(url) {
  const parsed = parseHttpUrl(url);
  if (!parsed) return "";
  const hostname = parsed.hostname;
  if (!hostname.includes(".")) return "";
  return hostname.split(".")[0] || "";
}
