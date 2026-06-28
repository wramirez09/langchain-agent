import { NextRequest } from "next/server";
import { StreamingTextResponse } from "ai";
import { z } from "zod";
import { waitUntil } from "@vercel/functions";

import { resolveApiAuth, touchApiKey } from "@/lib/auth/resolveApiAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { runChat, ChatStreamError } from "@/lib/handlers/runChat";
import { apiError, rateLimitHeaders, NO_STORE } from "@/lib/api/publicApi";

export const maxDuration = 180;

const ChatBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().min(1).max(10_000),
      }),
    )
    .min(1)
    .max(50),
});

/**
 * Public, API-key-authenticated simple chat completion. Streams `text/plain`.
 * Server-to-server only (no CORS reflection — the key is a secret).
 */
export async function POST(req: NextRequest) {
  const authResult = await resolveApiAuth(req);
  if (!authResult.ok) {
    return apiError(authResult.code, authResult.message, authResult.status);
  }
  const { auth } = authResult;

  if (!auth.scopes.includes("chat")) {
    return apiError("forbidden", "This key is not scoped for the chat endpoint.", 403);
  }

  const rl = await checkRateLimit(auth.orgId, auth.apiKeyId, auth.tier);
  const rlHeaders = rateLimitHeaders(rl);
  if (!rl.success) {
    return apiError("rate_limited", "Rate limit exceeded.", 429, {
      ...rlHeaders,
      "Retry-After": String(rl.retryAfterSeconds),
    });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return apiError("invalid_json", "Malformed JSON body.", 400, rlHeaders);
  }

  const parsed = ChatBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return apiError("invalid_request", "Request body failed validation.", 400, rlHeaders);
  }

  waitUntil(touchApiKey(auth.apiKeyId));

  try {
    const stream = await runChat({
      messages: parsed.data.messages,
      identity: {
        userId: auth.createdBy,
        orgId: auth.orgId,
        apiKeyId: auth.apiKeyId,
        source: "api",
      },
    });

    return new StreamingTextResponse(stream, {
      headers: { ...NO_STORE, ...rlHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (e) {
    if (e instanceof ChatStreamError) {
      return apiError("upstream_error", "The model could not complete the request.", 502, rlHeaders);
    }
    return apiError("internal_error", "The request could not be completed.", 500, rlHeaders);
  }
}
