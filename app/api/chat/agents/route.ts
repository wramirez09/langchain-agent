import { NextRequest, NextResponse } from "next/server";
import { Message as VercelChatMessage, StreamingTextResponse } from "ai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { llmAgent } from "@/lib/llm";
import { SerpAPI } from "@langchain/community/tools/serpapi";
import {
  AIMessage,
  ChatMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { z } from "zod";

import { AGENT_SYSTEM_CONTENT } from "./agentPrompt";
import { NCDCoverageSearchTool } from "./tools/NCDCoverageSearchTool";
import { localLcdSearchTool } from "./tools/localLcdSearchTool";
import { localCoverageArticleSearchTool } from "./tools/localArticleSearchTool";
import { policyContentExtractorTool } from "./tools/policyContentExtractorTool";
import { createCommercialGuidelineSearchTool } from "./tools/CommercialGuidelineSearchTool";
import { reportUsage } from "@/lib/usage";
import { getUserFromRequest } from "../../../../lib/auth/getUserFromRequest";
import { errorTracker } from "@/lib/error-tracking";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { waitUntil } from "@vercel/functions";

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
const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(10_000),
});

const RequestBodySchema = z.object({
  messages: z.array(ChatMessageSchema).min(1).max(50),
  threadId: z.string().uuid().optional(),
});

/* -------------------- OPTIONS -------------------- */
export async function OPTIONS(req: NextRequest) {
  return new Response(null, { headers: buildCorsHeaders(req) });
}

/* -------------------- MESSAGE CONVERSION -------------------- */
const convertVercelMessageToLangChainMessage = (
  message: VercelChatMessage | any,
) => {
  const text = typeof message.content === "string" ? message.content : "";

  if (message.role === "user") return new HumanMessage(text);
  if (message.role === "assistant") return new AIMessage(text);
  return new ChatMessage(text, message.role);
};

/* -------------------- POST -------------------- */
export async function POST(req: NextRequest) {
  let userId: string | undefined;
  const requestStartTime = Date.now();

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
      return NextResponse.json(
        { error: "INVALID_JSON", requestId: null },
        { status: 400, headers: buildCorsHeaders(req) },
      );
    }

    const parsed = RequestBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      console.warn(
        `[Agents API] Invalid request body for user ${userId}:`,
        parsed.error.flatten(),
      );
      return NextResponse.json(
        { error: "INVALID_REQUEST_BODY", requestId: null },
        { status: 400, headers: buildCorsHeaders(req) },
      );
    }

    const body = parsed.data;
    const clientType = req.headers.get("x-client") ?? "web";

    /* ---------- RATE LIMIT ---------- */
    // Per-user daily cap on agent runs. Counts the user's "user"-role rows
    // in chat_messages over the last 24h. This is a cost-runaway guard,
    // not anti-abuse — a real rate limiter would use Redis/KV. The cap
    // is generous; legitimate clinical workflows do not approach it.
    const RATE_LIMIT_PER_DAY = Number(
      process.env.AGENT_RATE_LIMIT_PER_DAY ?? 200,
    );
    if (RATE_LIMIT_PER_DAY > 0) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count, error: rateErr } = await supabaseAdmin
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("role", "user")
        .gte("created_at", since);
      if (rateErr) {
        console.error(
          `[Agents API] Rate-limit query failed for ${userId}:`,
          rateErr,
        );
        // Fail open: a database hiccup must not lock users out of a
        // healthcare workflow. The cost-runaway risk over a single
        // request is bounded by recursionLimit.
      } else if ((count ?? 0) >= RATE_LIMIT_PER_DAY) {
        console.warn(
          `[Agents API] Rate limit exceeded for ${userId}: ${count}/${RATE_LIMIT_PER_DAY}`,
        );
        return NextResponse.json(
          { error: "RATE_LIMIT_EXCEEDED", requestId: null },
          {
            status: 429,
            headers: {
              ...buildCorsHeaders(req),
              "Retry-After": "3600",
            },
          },
        );
      }
    }

    const messages = body.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map(convertVercelMessageToLangChainMessage);

    /* ---------- THREAD ID ---------- */
    const bodyThreadId = body.threadId ?? null;
    const threadId = bodyThreadId ?? crypto.randomUUID();
    const isNewThread = bodyThreadId === null;

    /* ---------- PERSIST USER MESSAGE ---------- */
    const lastUserMsg = [...body.messages]
      .reverse()
      .find((m) => m.role === "user");
    const lastUserContent = lastUserMsg?.content ?? "";

    if (lastUserContent) {
      try {
        let isThreadStarter = isNewThread;
        if (!isNewThread) {
          const { data: existing } = await supabaseAdmin
            .from("chat_messages")
            .select("id")
            .eq("user_id", userId)
            .eq("thread_id", threadId)
            .limit(1);
          isThreadStarter = !existing || existing.length === 0;
        }
        await supabaseAdmin.from("chat_messages").insert({
          user_id: userId,
          thread_id: threadId,
          role: "user",
          content: lastUserContent,
          status: "complete",
          is_thread_starter: isThreadStarter,
        });
      } catch (persistErr) {
        console.error("Failed to persist user message:", persistErr);
        errorTracker.trackError(
          persistErr as Error,
          "chat_messages user persistence",
          undefined,
          userId,
          undefined,
          "agents-persistence",
        );
      }
    }

    /* ---------- TOOLS ---------- */
    // Initialize commercial guideline search tool (documents pre-loaded at module scope)
    const commercialGuidelineTool = createCommercialGuidelineSearchTool();

    // FileUploadTool removed: response parser expects Gemini shape but
    // calls OpenAI, so it always returned "Failed to generate a summary."
    // It also reads arbitrary file paths from LLM input. Files reach the
    // agent via /api/retrieval/ingest → vector store, not this tool.
    const tools = [
      new SerpAPI(),
      commercialGuidelineTool,
      new NCDCoverageSearchTool(),
      localLcdSearchTool,
      localCoverageArticleSearchTool,
      policyContentExtractorTool,
    ];

    /* ---------- AGENT ---------- */
    const agent = createReactAgent({
      llm: llmAgent(),
      tools,
      messageModifier: new SystemMessage(AGENT_SYSTEM_CONTENT),
    });

    const agentConfig = {
      // recursionLimit caps the number of agent steps (LLM calls + tool
      // calls). Production runs typically take 8-12 steps. 50 was too
      // generous and created a cost-runaway surface — pathological loops
      // past 15 are not legitimate reasoning, they're stuck states.
      recursionLimit: 15,
      configurable: {
        thread_id: `user-${userId}-${Date.now()}`,
      },
    };

    /* ======================================================
     MOBILE — NON-STREAMING (RN SAFE)
     ====================================================== */
    if (clientType === "mobile") {
      const mobileStartTime = Date.now();
      console.log(
        `[Agents API] Starting mobile agent execution for user ${userId}`,
      );

      // Agent calls are expensive and non-idempotent — retrying replays
      // SerpAPI and other side-effecting tools. Invoke directly and
      // surface failures as a single opaque error code.
      let result: Awaited<ReturnType<typeof agent.invoke>>;
      try {
        result = await agent.invoke({ messages }, agentConfig);
      } catch (e) {
        const error = e as Error;
        const errorInfo = errorTracker.trackError(
          error,
          "Agent execution (mobile)",
          undefined,
          userId,
          undefined,
          "agents-mobile-execution",
        );
        return NextResponse.json(
          {
            error: "AGENT_EXECUTION_FAILED",
            requestId: errorInfo?.id ?? null,
          },
          { status: 500, headers: buildCorsHeaders(req) },
        );
      }

      const mobileElapsed = (
        (Date.now() - mobileStartTime) /
        1000
      ).toFixed(2);
      console.log(
        `✅ [Agents API] Mobile agent completed in ${mobileElapsed}s for user ${userId}`,
      );

      // Report usage only after successful agent completion
      void reportUsage({
        userId: userId!,
        usageType: "orchestrator",
        quantity: 1,
      }).catch(() => {});

      // Get last user + last assistant messages
      const lastUser = [...result.messages]
        .reverse()
        .find((m) => m._getType?.() === "human");

      const lastAssistant = [...result.messages]
        .reverse()
        .find((m) => m._getType?.() === "ai");

      const assistantContent =
        typeof lastAssistant?.content === "string"
          ? lastAssistant.content
          : lastAssistant
            ? JSON.stringify(lastAssistant.content)
            : "";

      if (assistantContent) {
        // Defer the DB write so it survives client disconnect. Vercel keeps
        // the function alive until waitUntil's promise resolves, even if the
        // HTTP response has already been sent or the client has gone away.
        const persistUserId = userId;
        waitUntil(
          (async () => {
            try {
              await supabaseAdmin.from("chat_messages").insert({
                user_id: persistUserId,
                thread_id: threadId,
                role: "assistant",
                content: assistantContent,
                status: "complete",
                is_thread_starter: false,
              });
            } catch (persistErr) {
              console.error(
                "Failed to persist assistant message:",
                persistErr,
              );
              errorTracker.trackError(
                persistErr as Error,
                "chat_messages assistant persistence (mobile, deferred)",
                undefined,
                persistUserId,
                undefined,
                "agents-persistence-deferred",
              );
            }
          })(),
        );
      }

      return NextResponse.json(
        {
          threadId,
          messages: [
            ...(lastUser
              ? [
                  {
                    role: "user",
                    content:
                      typeof lastUser.content === "string"
                        ? lastUser.content
                        : JSON.stringify(lastUser.content),
                  },
                ]
              : []),
            ...(lastAssistant
              ? [
                  {
                    role: "assistant",
                    content:
                      typeof lastAssistant.content === "string"
                        ? lastAssistant.content
                        : JSON.stringify(lastAssistant.content),
                  },
                ]
              : []),
          ],
        },
        {
          headers: { ...buildCorsHeaders(req), "x-thread-id": threadId },
        },
      );
    }

    /* ======================================================
       WEB — STREAMING (BACKWARDS COMPATIBLE)
       ====================================================== */
    const encoder = new TextEncoder();
    const streamStartTime = Date.now();
    console.log(`[Agents API] Starting web streaming for user ${userId}`);

    // Note: withRetry is intentionally not used here. ReadableStream errors propagate
    // through controller.error(), not as rejected promises, so retry wrappers are
    // ineffective on streaming paths. Errors are caught by the outer try/catch.
    //
    // streamAbort fires when the client cancels (browser tab closed, fetch
    // aborted, navigation away). Without it the LangChain run keeps going,
    // burning OpenAI tokens until recursionLimit — a real cost-leak vector.
    const streamAbort = new AbortController();
    const eventStream = agent.streamEvents(
      { messages },
      {
        version: "v2",
        signal: streamAbort.signal,
        ...agentConfig,
      },
    );

    let clientCancelled = false;

    const readable = new ReadableStream({
      async start(controller) {
        let streamCompleted = false;
        let firstChunkTime: number | null = null;
        let chunkCount = 0;
        let accumulated = "";

        try {
          for await (const { event, data } of eventStream) {
            if (
              event === "on_chat_model_stream" &&
              typeof data?.chunk?.content === "string" &&
              data.chunk.content.length > 0
            ) {
              if (!firstChunkTime) {
                firstChunkTime = Date.now();
                const timeToFirstChunk = (
                  (firstChunkTime - streamStartTime) /
                  1000
                ).toFixed(2);
                console.log(
                  `[Agents API] First chunk received after ${timeToFirstChunk}s for user ${userId}`,
                );
              }
              chunkCount++;
              accumulated += data.chunk.content;
              controller.enqueue(encoder.encode(data.chunk.content));
            }
          }
          streamCompleted = true;
          const totalElapsed = (
            (Date.now() - streamStartTime) /
            1000
          ).toFixed(2);
          console.log(
            `✅ [Agents API] Stream completed in ${totalElapsed}s (${chunkCount} chunks) for user ${userId}`,
          );
        } catch (err) {
          const errorElapsed = (
            (Date.now() - streamStartTime) /
            1000
          ).toFixed(2);
          console.error(
            `❌ [Agents API] Stream error after ${errorElapsed}s for user ${userId}:`,
            err,
          );
          controller.error(err);
        } finally {
          // Report usage only after a full successful stream
          if (streamCompleted) {
            void reportUsage({
              userId: userId!,
              usageType: "orchestrator",
              quantity: 1,
            }).catch(() => {});
          }
          if (accumulated) {
            try {
              await supabaseAdmin.from("chat_messages").insert({
                user_id: userId,
                thread_id: threadId,
                role: "assistant",
                content: accumulated,
                status:
                  streamCompleted && !clientCancelled ? "complete" : "partial",
                is_thread_starter: false,
              });
            } catch (persistErr) {
              console.error(
                "Failed to persist assistant message:",
                persistErr,
              );
              errorTracker.trackError(
                persistErr as Error,
                "chat_messages assistant persistence (web)",
                undefined,
                userId,
                undefined,
                "agents-persistence",
              );
            }
          }
          controller.close();
        }
      },
      cancel(reason) {
        clientCancelled = true;
        console.log(
          `[Agents API] Client cancelled stream for user ${userId}:`,
          reason,
        );
        streamAbort.abort();
      },
    });

    return new StreamingTextResponse(readable, {
      headers: {
        ...buildCorsHeaders(req),
        "Content-Type": "text/plain; charset=utf-8",
        "x-thread-id": threadId,
      },
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
      {
        error: "INTERNAL_ERROR",
        requestId: errorInfo?.id ?? null,
      },
      {
        status: (error as { status?: number }).status ?? 500,
        headers: buildCorsHeaders(req),
      },
    );
  }
}
