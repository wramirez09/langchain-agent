import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getUserFromRequest } from "../../../../lib/auth/getUserFromRequest";
import { errorTracker } from "@/lib/error-tracking";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runAgent } from "@/lib/handlers/runAgent";
import type { ErrorResponder } from "@/lib/handlers/types";

// Vercel Pro plan ceiling. Mobile agent runs commonly take 45-65s; web
// streaming completes faster. Raising the limit prevents the function
// from being killed mid-tool-call.
export const maxDuration = 300;

/* -------------------- CORS -------------------- */
const ALLOWED_ORIGINS = new Set<string>([
  "https://app.notedoctor.ai",
  "https://preauthproduction-git-dev-center-point-digital.vercel.app",
  ...(process.env.NODE_ENV !== "production"
    ? ["http://localhost:3000", "http://localhost:8081"]
    : []),
]);

function buildCorsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, content-type, x-client",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

/* -------------------- VALIDATION -------------------- */
// Vercel AI SDK `useChat` sends messages with a `parts` array and an empty
// `content` string. Accept either shape so the web client isn't rejected.
//
// Per-message ceiling is generous: a single agent turn can carry extracted
// policy/PDF content or a long assistant answer that easily exceeds a few
// thousand characters. 100k chars (~25k tokens) bounds payload abuse without
// rejecting legitimate conversation history.
const MAX_MESSAGE_CHARS = 100_000;

const MessagePartSchema = z.object({
  type: z.string(),
  text: z.string().max(MAX_MESSAGE_CHARS).optional(),
});

const ChatMessageSchema = z
  .object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string().max(MAX_MESSAGE_CHARS).optional(),
    parts: z.array(MessagePartSchema).max(50).optional(),
  })
  .refine(
    (m) =>
      (typeof m.content === "string" && m.content.length > 0) ||
      (Array.isArray(m.parts) && m.parts.length > 0),
    { message: "message must have content or parts" },
  );

// A live conversation can accumulate many turns. The cap is a generous abuse
// bound only; the full history is sent to the LLM, which has ample context
// window for a normal conversation.
export const RequestBodySchema = z.object({
  messages: z.array(ChatMessageSchema).min(1).max(200),
  threadId: z.string().uuid().optional(),
});

/* -------------------- OPTIONS -------------------- */
export async function OPTIONS(req: NextRequest) {
  return new Response(null, { headers: buildCorsHeaders(req) });
}

/* -------------------- GET (warm-up ping) --------------------
 * Cheap no-op so the client can pre-warm this lambda while the
 * user is still filling out the form. Runs no LLM calls. */
export async function GET(req: NextRequest) {
  return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
    status: 200,
    headers: {
      ...buildCorsHeaders(req),
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

/* -------------------- POST -------------------- */
export async function POST(req: NextRequest) {
  let userId: string | undefined;
  const requestStartTime = Date.now();
  const cors = buildCorsHeaders(req);

  // Legacy error envelope, preserved for the web + mobile clients.
  const respondError: ErrorResponder = ({ code, status, requestId }) =>
    NextResponse.json(
      { error: code, requestId: requestId ?? null },
      { status, headers: cors },
    );

  try {
    /* ---------- AUTH ---------- */
    const user = await getUserFromRequest(req);
    userId = user.id;

    console.log(
      `[Agents API] Request started for user ${userId} at ${new Date().toISOString()}`,
    );

    /* ---------- REQUEST VALIDATION ---------- */
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return respondError({ code: "INVALID_JSON", message: "Malformed JSON.", status: 400 });
    }

    const parsed = RequestBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      console.warn(
        `[Agents API] Invalid request body for user ${userId}:`,
        parsed.error.flatten(),
      );
      return respondError({
        code: "INVALID_REQUEST_BODY",
        message: "Request body failed validation.",
        status: 400,
      });
    }

    const body = parsed.data;
    const clientType = req.headers.get("x-client") ?? "web";

    /* ---------- RATE LIMIT ---------- */
    // Per-user daily cap on agent runs. Counts the user's "user"-role rows
    // in chat_messages over the last 24h. This is a cost-runaway guard,
    // not anti-abuse — the public API path uses the durable Upstash limiter.
    const RATE_LIMIT_PER_DAY = Number(process.env.AGENT_RATE_LIMIT_PER_DAY ?? 200);
    if (RATE_LIMIT_PER_DAY > 0) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count, error: rateErr } = await supabaseAdmin
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("role", "user")
        .gte("created_at", since);
      if (rateErr) {
        console.error(`[Agents API] Rate-limit query failed for ${userId}:`, rateErr);
        // Fail open: a database hiccup must not lock users out of a
        // healthcare workflow. Cost risk over a single request is bounded
        // by recursionLimit.
      } else if ((count ?? 0) >= RATE_LIMIT_PER_DAY) {
        console.warn(
          `[Agents API] Rate limit exceeded for ${userId}: ${count}/${RATE_LIMIT_PER_DAY}`,
        );
        return NextResponse.json(
          { error: "RATE_LIMIT_EXCEEDED", requestId: null },
          { status: 429, headers: { ...cors, "Retry-After": "3600" } },
        );
      }
    }

    /* ---------- EXECUTE ---------- */
    return await runAgent({
      messages: body.messages,
      threadId: body.threadId ?? null,
      clientType,
      identity: { userId: userId!, source: clientType === "mobile" ? "mobile" : "web" },
      baseHeaders: cors,
      respondError,
    });
  } catch (e: unknown) {
    const error = e as Error;
    const requestElapsed = ((Date.now() - requestStartTime) / 1000).toFixed(2);
    console.error(
      `❌ [Agents API] Request failed after ${requestElapsed}s for user ${userId}:`,
      error.message,
    );

    const errorInfo = errorTracker.trackError(
      error,
      "Agents API request",
      undefined,
      userId,
      undefined,
      "agents-api-request",
    );

    return NextResponse.json(
      { error: "INTERNAL_ERROR", requestId: errorInfo?.id ?? null },
      { status: (error as { status?: number }).status ?? 500, headers: cors },
    );
  }
}
