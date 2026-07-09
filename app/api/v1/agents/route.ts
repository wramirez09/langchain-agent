import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";

import { resolveApiAuth, touchApiKey } from "@/lib/auth/resolveApiAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { orgHasApiAccess } from "@/lib/billing/apiAccess";
import { runAgent } from "@/lib/handlers/runAgent";
import { RequestBodySchema } from "@/app/api/chat/agents/route";
import { apiError, rateLimitHeaders, NO_STORE } from "@/lib/api/publicApi";
import type { ErrorResponder } from "@/lib/handlers/types";

// Same Vercel ceiling as the internal agent route — runs can take 45-65s.
export const maxDuration = 300;

/**
 * Public, API-key-authenticated medical pre-auth research agent.
 *
 * Server-to-server only: the key is a secret and must never ship to a browser,
 * so there is no CORS reflection here. Returns a single JSON response by default
 * ({ threadId, messages }, assistant `content` = a PriorAuthArtifact object, the
 * same typed shape the web app renders). Streaming is optional — pass
 * `{ "stream": true }` (defaults to false) for a `text/plain` token stream.
 */
export async function POST(req: NextRequest) {
  /* ---------- AUTH ---------- */
  const authResult = await resolveApiAuth(req);
  if (!authResult.ok) {
    return apiError(authResult.code, authResult.message, authResult.status);
  }
  const { auth } = authResult;

  /* ---------- SCOPE ---------- */
  if (!auth.scopes.includes("agents")) {
    return apiError("forbidden", "This key is not scoped for the agents endpoint.", 403);
  }

  /* ---------- PLAN / API ACCESS ---------- */
  const access = await orgHasApiAccess(auth.orgId);
  if (!access.allowed) {
    return apiError("payment_required", "API access is not included in this plan.", 402);
  }

  /* ---------- RATE LIMIT ---------- */
  const rl = await checkRateLimit(auth.orgId, auth.apiKeyId, auth.tier);
  const rlHeaders = rateLimitHeaders(rl);
  if (!rl.success) {
    return apiError("rate_limited", "Rate limit exceeded.", 429, {
      ...rlHeaders,
      "Retry-After": String(rl.retryAfterSeconds),
    });
  }

  /* ---------- VALIDATION ---------- */
  let rawBody: any;
  try {
    rawBody = await req.json();
  } catch {
    return apiError("invalid_json", "Malformed JSON body.", 400, rlHeaders);
  }

  const parsed = RequestBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return apiError("invalid_request", "Request body failed validation.", 400, rlHeaders);
  }

  // Return structured JSON by default — the same { threadId, messages } shape
  // the app produces. Opt into token streaming with `"stream": true` (a
  // validated boolean on RequestBodySchema).
  const wantsStream = parsed.data.stream === true;

  waitUntil(touchApiKey(auth.apiKeyId));

  /* ---------- EXECUTE ---------- */
  const respondError: ErrorResponder = ({ code, message, status, requestId }) =>
    apiError(code, message, status, rlHeaders, requestId ?? null);

  try {
    return await runAgent({
      messages: parsed.data.messages,
      threadId: parsed.data.threadId ?? null,
      // "mobile" client type yields the non-streaming JSON branch (default);
      // "api" streams text/plain when the caller opts in.
      clientType: wantsStream ? "api" : "mobile",
      identity: {
        userId: auth.createdBy,
        orgId: auth.orgId,
        apiKeyId: auth.apiKeyId,
        source: "api",
      },
      baseHeaders: { ...NO_STORE, ...rlHeaders },
      respondError,
    });
  } catch {
    return apiError("internal_error", "The request could not be completed.", 500, rlHeaders);
  }
}
