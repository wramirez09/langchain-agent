import { NextResponse } from "next/server";

import { protectedResourceMetadata } from "@/lib/mcp/oauth/metadata";

export const dynamic = "force-dynamic";

/**
 * RFC 9728 protected resource metadata for `/api/mcp`.
 *
 * Served at both `/.well-known/oauth-protected-resource/api/mcp` (what the 401
 * challenge names, and what clients probe first) and the bare root (their
 * fallback). There is one protected resource, so every path gets the same
 * document. It is public by definition, so it allows any origin — browser
 * based clients such as the MCP Inspector read it cross-origin.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export function GET(): Response {
  return NextResponse.json(protectedResourceMetadata(), {
    headers: { ...CORS, "Cache-Control": "public, max-age=300" },
  });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
