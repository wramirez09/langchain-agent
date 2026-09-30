import { waitUntil } from "@vercel/functions";

import { touchApiKey } from "@/lib/auth/resolveApiAuth";
import { userHasApiAccess } from "@/lib/billing/apiAccess";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  apiError,
  rateLimitHeaders,
  rateLimitedResponse,
  NO_STORE,
} from "@/lib/api/publicApi";
import {
  mcpWwwAuthenticate,
  rateLimitSubject,
  resolveMcpAuth,
} from "@/lib/mcp/auth";
import { getHandler, toAuthInfo } from "@/lib/mcp/handler";
import { hasAnyMcpScope } from "@/lib/mcp/policy";

// A full screening runs 45-65s behind a 270s watchdog, same as /api/v1/agents.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * MCP (Model Context Protocol) endpoint — NoteDoctorAi's coverage research
 * published to Claude Code, Claude Desktop, Cursor and any other MCP client.
 *
 * This file is the transport edge and nothing else: it runs exactly the stages
 * `/api/v1/agents` runs, in the same order and with the same envelopes, then
 * hands the request to the SDK. Everything that has logic worth testing lives
 * under `lib/mcp/**`; this glue stays here because `jest.config.js` collects
 * coverage from `lib/**` at an 80% threshold and untestable wiring should not
 * be dragging that around.
 *
 * Auth sits entirely in FRONT of the SDK handler, which is what keeps the
 * public-API contracts (401/402/403/429 shapes, rate-limit headers,
 * `Idempotency-Key`) byte-identical to the REST surface.
 *
 * Two credentials reach this route: an `sk_` API key (Claude Code, Cursor,
 * scripts) and a Supabase OAuth access token (claude.ai / ChatGPT connectors).
 * `resolveMcpAuth` normalises both to one context, so nothing below branches.
 *
 * No CORS, matching `/api/v1/*`: connectors call from their own servers, and
 * the key is a secret that must never ship to a browser. `proxy.ts`'s matcher
 * already excludes `/api`, so no middleware change is needed.
 */
async function handle(req: Request): Promise<Response> {
  /* ---------- AUTH ---------- */
  const authResult = await resolveMcpAuth(req);
  if (!authResult.ok) {
    // `WWW-Authenticate` with `resource_metadata` is what starts OAuth in the
    // claude.ai and ChatGPT connectors; an API-key client just prompts.
    return apiError(authResult.code, authResult.message, authResult.status, {
      "WWW-Authenticate": mcpWwwAuthenticate(),
    });
  }
  const { auth } = authResult;

  /* ---------- SCOPE ---------- */
  if (!hasAnyMcpScope(auth)) {
    return apiError("forbidden", "This key is not scoped for the MCP endpoint.", 403);
  }

  /* ---------- PLAN / API ACCESS ---------- */
  const access = await userHasApiAccess(auth.createdBy);
  if (!access.allowed) {
    return apiError("payment_required", "The API requires an active subscription.", 402);
  }

  /* ---------- RATE LIMIT ----------
   * One HTTP request costs one token. The 2025 protocol permits JSON-RPC batch
   * arrays, so a batching client could in principle smuggle N calls for one
   * token; no shipping MCP client batches, and the org-level limiter plus
   * maxDuration bound the blast radius. Documented rather than over-built. */
  const rl = await checkRateLimit(auth.orgId, rateLimitSubject(auth), auth.tier);
  const rlHeaders = rateLimitHeaders(rl);
  if (!rl.success) return rateLimitedResponse(rl);

  if (auth.apiKeyId) waitUntil(touchApiKey(auth.apiKeyId));

  /* ---------- SERVE ---------- */
  const res = await getHandler().fetch(req, { authInfo: toAuthInfo(auth) });

  /* ---------- HEADERS ----------
   * A returned Response's headers are immutable, so merge by re-wrapping. The
   * body may be an SSE stream (the handler upgrades when a tool emits progress
   * before its result), so pass the ReadableStream straight through rather
   * than reading it. */
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: new Headers([
      ...res.headers,
      ...Object.entries({ ...NO_STORE, ...rlHeaders }),
    ]),
  });
}

export { handle as POST, handle as GET, handle as DELETE };
