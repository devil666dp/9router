import { NextResponse } from "next/server";
import { pingModelByKind } from "./ping";
import { runProbe, runAllProbes, PROBE_CAPABILITIES } from "./probes";

// POST /api/models/test
//   { model, kind? }                → plain reachability ping (unchanged)
//   { model, capability: "vision" } → probe one capability against the provider
//   { model, capability: "all" }    → probe every capability, sequentially
export async function POST(request) {
  try {
    const { model, kind, capability } = await request.json();
    if (!model) return NextResponse.json({ error: "Model required" }, { status: 400 });

    if (capability) {
      if (capability === "all") {
        return NextResponse.json(await runAllProbes(model));
      }
      if (!PROBE_CAPABILITIES.includes(capability)) {
        return NextResponse.json(
          { error: `Unknown capability "${capability}". Expected one of: ${PROBE_CAPABILITIES.join(", ")}, all` },
          { status: 400 }
        );
      }
      return NextResponse.json(await runProbe(capability, model));
    }

    const result = await pingModelByKind(model, kind || "llm");
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
