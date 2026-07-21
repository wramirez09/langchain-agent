import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";

import { resolveApiAuth, touchApiKey } from "@/lib/auth/resolveApiAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { userHasApiAccess } from "@/lib/billing/apiAccess";
import { runAgent } from "@/lib/handlers/runAgent";
import { RequestBodySchema } from "@/app/api/chat/agents/route";
import {
  apiError,
  rateLimitHeaders,
  rateLimitedResponse,
  NO_STORE,
} from "@/lib/api/publicApi";
import * as idempotency from "@/lib/api/idempotency";
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
  const access = await userHasApiAccess(auth.createdBy);
  if (!access.allowed) {
    return apiError("payment_required", "The API requires an active subscription.", 402);
  }

  /* ---------- RATE LIMIT ---------- */
  const rl = await checkRateLimit(auth.orgId, auth.apiKeyId, auth.tier);
  const rlHeaders = rateLimitHeaders(rl);
  if (!rl.success) return rateLimitedResponse(rl);

  const idemKey = idempotency.readIdempotencyKey(req);
  if (idemKey && !idempotency.isValidIdempotencyKey(idemKey)) {
    return apiError("invalid_request", "Idempotency-Key is too long.", 400, rlHeaders);
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

  /* ---------- IDEMPOTENCY ---------- */
  const idem = await idempotency.begin({
    // Streaming responses are not replayable, so they opt out entirely.
    key: wantsStream ? null : idemKey,
    orgId: auth.orgId,
    endpoint: "v1/agents",
    body: parsed.data,
    errorResponse: (code, message, status) => apiError(code, message, status, rlHeaders),
  });
  if (idem.kind === "replay" || idem.kind === "conflict") return idem.response;
  const commit = idem.kind === "proceed" ? idem.commit : async (r: Response) => r;

  waitUntil(touchApiKey(auth.apiKeyId));

  /* ---------- EXECUTE ---------- */
  const respondError: ErrorResponder = ({ code, message, status, requestId }) =>
    apiError(code, message, status, rlHeaders, requestId ?? null);

  try {
    return await commit(
      await runAgent({
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
      }),
    );
  } catch {
    return await commit(
      apiError("internal_error", "The request could not be completed.", 500, rlHeaders),
    );
  }
}
