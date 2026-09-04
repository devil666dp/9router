import { NextResponse } from "next/server";
import { createProviderNode, getProviderNodes } from "@/models";
import { OPENAI_COMPATIBLE_PREFIX, ANTHROPIC_COMPATIBLE_PREFIX, CUSTOM_EMBEDDING_PREFIX, CUSTOM_ENDPOINT_PREFIX } from "@/shared/constants/providers";
import { validateSpec, specUrls } from "open-sse/handlers/customEndpoint/index.js";
import { assertPublicUrl } from "@/shared/utils/ssrfGuard.js";
import { parseLogoUrl } from "@/shared/utils/logoUrl.js";
import { isLocalRequest } from "@/dashboardGuard";
import { generateId } from "@/shared/utils";

export const dynamic = "force-dynamic";

const OPENAI_COMPATIBLE_DEFAULTS = {
  baseUrl: "https://api.openai.com/v1",
};

const ANTHROPIC_COMPATIBLE_DEFAULTS = {
  baseUrl: "https://api.anthropic.com/v1",
};

const CUSTOM_EMBEDDING_DEFAULTS = {
  baseUrl: "https://api.openai.com/v1",
};

// GET /api/provider-nodes - List all provider nodes
export async function GET() {
  try {
    const nodes = await getProviderNodes();
    return NextResponse.json({ nodes });
  } catch (error) {
    console.log("Error fetching provider nodes:", error);
    return NextResponse.json({ error: "Failed to fetch provider nodes" }, { status: 500 });
  }
}

// POST /api/provider-nodes - Create provider node
export async function POST(request) {
  try {
    const body = await request.json();
    const { name, prefix, apiType, baseUrl, type, spec, logoUrl } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (!prefix?.trim()) {
      return NextResponse.json({ error: "Prefix is required" }, { status: 400 });
    }

    // Optional brand logo. Only the scheme is enforced — the browser is what
    // fetches it, so a private/LAN logo host stays usable.
    let logo;
    try {
      // undefined, not "", so a blank field leaves no key in the JSON column.
      logo = parseLogoUrl(logoUrl) || undefined;
    } catch (logoError) {
      return NextResponse.json({ error: logoError.message }, { status: 400 });
    }

    // Determine type
    const nodeType = type || "openai-compatible";

    if (nodeType === "openai-compatible") {
      if (!apiType || !["chat", "responses"].includes(apiType)) {
        return NextResponse.json({ error: "Invalid OpenAI compatible API type" }, { status: 400 });
      }

      const node = await createProviderNode({
        id: `${OPENAI_COMPATIBLE_PREFIX}${apiType}-${generateId()}`,
        type: "openai-compatible",
        prefix: prefix.trim(),
        apiType,
        baseUrl: (baseUrl || OPENAI_COMPATIBLE_DEFAULTS.baseUrl).trim(),
        name: name.trim(),
        logoUrl: logo,
      });
      return NextResponse.json({ node }, { status: 201 });
    }

    if (nodeType === "custom-embedding") {
      // Strip trailing slash and /embeddings if user pasted full endpoint
      let sanitizedBaseUrl = (baseUrl || CUSTOM_EMBEDDING_DEFAULTS.baseUrl).trim().replace(/\/$/, "");
      if (sanitizedBaseUrl.endsWith("/embeddings")) {
        sanitizedBaseUrl = sanitizedBaseUrl.slice(0, -"/embeddings".length);
      }

      const node = await createProviderNode({
        id: `${CUSTOM_EMBEDDING_PREFIX}${generateId()}`,
        type: "custom-embedding",
        prefix: prefix.trim(),
        baseUrl: sanitizedBaseUrl,
        name: name.trim(),
        logoUrl: logo,
      });
      return NextResponse.json({ node }, { status: 201 });
    }

    if (nodeType === "anthropic-compatible") {
      // Sanitize Base URL: remove trailing slash, and remove trailing /messages if user added it
      // This prevents double-appending /messages at runtime
      let sanitizedBaseUrl = (baseUrl || ANTHROPIC_COMPATIBLE_DEFAULTS.baseUrl).trim().replace(/\/$/, "");
      if (sanitizedBaseUrl.endsWith("/messages")) {
        sanitizedBaseUrl = sanitizedBaseUrl.slice(0, -9); // remove /messages
      }

      const node = await createProviderNode({
        id: `${ANTHROPIC_COMPATIBLE_PREFIX}${generateId()}`,
        type: "anthropic-compatible",
        prefix: prefix.trim(),
        baseUrl: sanitizedBaseUrl,
        name: name.trim(),
        logoUrl: logo,
      });
      return NextResponse.json({ node }, { status: 201 });
    }

    if (nodeType === "custom-endpoint") {
      // A recipe describes an upstream that speaks none of the known formats.
      // Validate hard here so a bad shape never reaches the runtime, where a
      // missing path would only surface as an unhelpful empty reply.
      const errors = validateSpec(spec);
      if (errors.length) {
        return NextResponse.json({ error: `Invalid recipe: ${errors.join("; ")}` }, { status: 400 });
      }

      // Same SSRF stance as the validate route: a remote caller may not point
      // a recipe at loopback or link-local addresses. Local callers may (that
      // is the whole point of importing a self-hosted endpoint).
      if (!isLocalRequest(request)) {
        for (const url of specUrls(spec)) {
          try {
            // Placeholders are not yet substituted; swap them for a benign
            // label so the URL parses while the host stays the real one.
            assertPublicUrl(url.replace(/\{[^}]*\}/g, "x"));
          } catch (error) {
            return NextResponse.json({ error: `Recipe URL rejected: ${error.message}` }, { status: 400 });
          }
        }
      }

      const node = await createProviderNode({
        id: `${CUSTOM_ENDPOINT_PREFIX}${generateId()}`,
        type: "custom-endpoint",
        prefix: prefix.trim(),
        name: name.trim(),
        logoUrl: logo,
        spec,
      });
      return NextResponse.json({ node }, { status: 201 });
    }

    return NextResponse.json({ error: "Invalid provider node type" }, { status: 400 });
  } catch (error) {
    console.log("Error creating provider node:", error);
    return NextResponse.json({ error: "Failed to create provider node" }, { status: 500 });
  }
}
