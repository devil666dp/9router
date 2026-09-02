import { NextResponse } from "next/server";
import { getProxyPoolById, updateProxyPool } from "@/models";
import { testProxyUrl } from "@/lib/network/proxyTest";
import { isRelayProxyType } from "@/shared/constants/proxyTypes";
import { fetch as undiciFetch } from "undici";

// Probe targets, tried in order. A relay is only as reachable as the target it
// is asked to forward to, so one target being down must not condemn the relay —
// the pool is marked dead only when every target fails.
const RELAY_PROBE_TARGETS = [
  { target: "https://www.gstatic.com", path: "/generate_204" },
  { target: "https://cloudflare.com", path: "/cdn-cgi/trace" },
  { target: "https://httpbin.org", path: "/get" },
];

// Relays are probed through their own header spec — one that answers on its URL
// but does not forward is not a working pool. Written against the spec rather
// than against our deploy routes, so a hand-deployed relay probes identically.
async function probeRelayTarget(relayUrl, { target, path }, timeoutMs) {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await undiciFetch(relayUrl, {
      method: "GET",
      headers: {
        "x-relay-target": target,
        "x-relay-path": path,
      },
      signal: controller.signal,
    });
    // Drain so undici can release the connection.
    await res.arrayBuffer().catch(() => {});
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      error: res.ok ? null : `Relay returned ${res.status} forwarding to ${target}`,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: err?.name === "AbortError" ? "Relay test timed out" : (err?.message || String(err)),
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function testRelay(relayUrl, timeoutMs = 10000) {
  let last = { ok: false, status: 500, error: "Relay test did not run" };
  for (const probe of RELAY_PROBE_TARGETS) {
    last = await probeRelayTarget(relayUrl, probe, timeoutMs);
    if (last.ok) return last;
  }
  return last;
}

// POST /api/proxy-pools/[id]/test - Test proxy pool entry
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const proxyPool = await getProxyPoolById(id);

    if (!proxyPool) {
      return NextResponse.json({ error: "Proxy pool not found" }, { status: 404 });
    }

    const isRelay = isRelayProxyType(proxyPool.type);
    const result = isRelay
      ? await testRelay(proxyPool.proxyUrl)
      : await testProxyUrl({ proxyUrl: proxyPool.proxyUrl });
    const now = new Date().toISOString();

    await updateProxyPool(id, {
      testStatus: result.ok ? "active" : "error",
      lastTestedAt: now,
      lastError: result.ok ? null : (result.error || `${isRelay ? "Relay" : "Proxy"} test failed with status ${result.status}`),
      isActive: result.ok,
    });

    return NextResponse.json({
      ok: result.ok,
      status: result.status,
      statusText: result.statusText || null,
      error: result.error || null,
      elapsedMs: result.elapsedMs || 0,
      testedAt: now,
    });
  } catch (error) {
    console.log("Error testing proxy pool:", error);
    return NextResponse.json({ error: "Failed to test proxy pool" }, { status: 500 });
  }
}
