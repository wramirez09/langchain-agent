import { NextRequest, NextResponse } from "next/server";
import { StreamingTextResponse } from "ai";
import { z } from "zod";
import { waitUntil } from "@vercel/functions";

import { resolveApiAuth, touchApiKey } from "@/lib/auth/resolveApiAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { userHasApiAccess } from "@/lib/billing/apiAccess";
import { runChat, ChatStreamError } from "@/lib/handlers/runChat";
import {
  apiError,
  rateLimitHeaders,
  rateLimitedResponse,
  NO_STORE,
} from "@/lib/api/publicApi";
import * as idempotency from "@/lib/api/idempotency";

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
  // Parity with /agents: buffered JSON by default, opt into a token stream with
  // `"stream": true`. Only a boolean true streams; other values fall back to false.
  stream: z.boolean().optional().catch(false),
});

/** Drain a byte stream to a string (buffered, non-streaming response). */
async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

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

  const access = await userHasApiAccess(auth.createdBy);
  if (!access.allowed) {
    return apiError("payment_required", "The API requires an active subscription.", 402);
  }

  const rl = await checkRateLimit(auth.orgId, auth.apiKeyId, auth.tier);
  const rlHeaders = rateLimitHeaders(rl);
  if (!rl.success) return rateLimitedResponse(rl);

  const idemKey = idempotency.readIdempotencyKey(req);
  if (idemKey && !idempotency.isValidIdempotencyKey(idemKey)) {
    return apiError("invalid_request", "Idempotency-Key is too long.", 400, rlHeaders);
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

  const wantsStream = parsed.data.stream === true;

  const idem = await idempotency.begin({
    // Streaming responses are not replayable, so they opt out entirely.
    key: wantsStream ? null : idemKey,
    orgId: auth.orgId,
    endpoint: "v1/chat",
    body: parsed.data,
    errorResponse: (code, message, status) => apiError(code, message, status, rlHeaders),
  });
  if (idem.kind === "replay" || idem.kind === "conflict") return idem.response;
  const commit = idem.kind === "proceed" ? idem.commit : async (r: Response) => r;

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

    // Opt-in token stream… (never idempotency-stored — a stream can't be replayed)
    if (wantsStream) {
      return new StreamingTextResponse(stream, {
        headers: { ...NO_STORE, ...rlHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // …or the default: buffer to a single JSON reply (usage still meters on the
    // stream's flush as it drains). Shape mirrors the agents endpoint's messages.
    const content = await streamToString(stream);
    return await commit(
      NextResponse.json(
        { message: { role: "assistant", content } },
        { headers: { ...NO_STORE, ...rlHeaders } },
      ),
    );
  } catch (e) {
    if (e instanceof ChatStreamError) {
      return await commit(
        apiError("upstream_error", "The model could not complete the request.", 502, rlHeaders),
      );
    }
    return await commit(
      apiError("internal_error", "The request could not be completed.", 500, rlHeaders),
    );
  }
}
