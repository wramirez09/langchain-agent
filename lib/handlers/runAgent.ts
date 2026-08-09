import { NextResponse } from "next/server";
import { StreamingTextResponse } from "ai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { SerpAPI } from "@langchain/community/tools/serpapi";
import { AIMessage, ChatMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { waitUntil } from "@vercel/functions";

import { llmAgent } from "@/lib/llm";
import { reportUsage } from "@/lib/usage";
import { errorTracker } from "@/lib/error-tracking";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { AGENT_SYSTEM_CONTENT } from "@/app/api/chat/agents/agentPrompt";
import { NCDCoverageSearchTool } from "@/app/api/chat/agents/tools/NCDCoverageSearchTool";
import { localLcdSearchTool } from "@/app/api/chat/agents/tools/localLcdSearchTool";
import { localCoverageArticleSearchTool } from "@/app/api/chat/agents/tools/localArticleSearchTool";
import { medicareMultiSearchTool } from "@/app/api/chat/agents/tools/medicareMultiSearchTool";
import { policyContentExtractorTool } from "@/app/api/chat/agents/tools/policyContentExtractorTool";
import { medicarePolicyDetailTool } from "@/app/api/chat/agents/tools/medicarePolicyDetailTool";
import { createCommercialGuidelineSearchTool } from "@/app/api/chat/agents/tools/CommercialGuidelineSearchTool";
import { startCmsWarmup } from "@/app/api/chat/agents/tools/warmup";

import { type PriorAuthArtifact } from "@/lib/priorAuth/artifactSchema";
import {
  collectToolMessages,
  EVIDENCE_TOOLS,
  type ToolMessageRecord,
} from "@/lib/priorAuth/backfillCodes";
import { encodeFrame } from "@/lib/priorAuth/streamFrames";
import { looksLikeArtifact } from "@/lib/priorAuth/extractArtifact";
import { finalizeAssistantAnswer } from "./finalizeAnswer";

/**
 * How long to wait before giving up on reviewing and sending the raw answer.
 * Chosen to land comfortably inside the routes' maxDuration = 300.
 */
const WATCHDOG_MS = 270_000;

import type { AgentJsonResponse, AgentResponseMessage, CallerIdentity, ErrorResponder } from "./types";

// Kick off CMS fetch + embedding preload at module init so the first real
// request finds the hybrid index hot. Idempotent — safe across both the
// internal route and the public v1 route importing this module.
startCmsWarmup();

/* -------------------- MESSAGE CONVERSION -------------------- */
const extractText = (message: any): string => {
  let content = message.content;
  if ((!content || content === "") && Array.isArray(message.parts)) {
    content = message.parts
      .filter((p: any) => p?.type === "text")
      .map((p: any) => p?.text ?? "")
      .join("\n");
  }
  return typeof content === "string" ? content : "";
};

export const convertVercelMessageToLangChainMessage = (message: any) => {
  const text = extractText(message);
  if (message.role === "user") return new HumanMessage(text);
  if (message.role === "assistant") return new AIMessage(text);
  return new ChatMessage(text, message.role);
};

/**
 * The retrieval toolset. Shared with runChat so both public surfaces search the
 * same corpora — a chat answer researched from a smaller toolset would be
 * quietly less grounded than the same question asked of /agents.
 */
export function createAgentTools() {
  return [
    new SerpAPI(),
    createCommercialGuidelineSearchTool(),
    medicareMultiSearchTool,
    new NCDCoverageSearchTool(),
    localLcdSearchTool,
    localCoverageArticleSearchTool,
    medicarePolicyDetailTool,
    policyContentExtractorTool,
  ];
}

export type RunAgentParams = {
  /** Validated Vercel-shape messages (role + content/parts). */
  messages: any[];
  threadId?: string | null;
  /** "mobile" → non-streaming JSON; anything else → streaming text. */
  clientType: string;
  identity: CallerIdentity;
  /** Headers attached to every response (CORS for web, no-store for API). */
  baseHeaders?: Record<string, string>;
  /** Renders handled errors in the caller's envelope. */
  respondError: ErrorResponder;
};

/**
 * Core LangGraph agent execution shared by the internal route
 * (app/api/chat/agents) and the public API route (app/api/v1/agents).
 *
 * Owns: message conversion, thread resolution, chat_messages persistence,
 * agent run (mobile JSON + web streaming), usage reporting, and abort/cost
 * handling. Does NOT own auth, rate limiting, or request validation — those
 * are surface-specific and stay in the route.
 */
export async function runAgent(params: RunAgentParams): Promise<Response> {
  const { messages: rawMessages, clientType, identity, respondError } = params;
  const baseHeaders = params.baseHeaders ?? {};
  const { userId } = identity;
  const streamStartTime = Date.now();

  // The public API runs stateless: external clients send full history per
  // request and manage their own threads, so we do NOT persist their queries
  // or answers to chat_messages. This keeps us out of PHI custody for API
  // traffic. First-party web/mobile still persist for the history UI.
  const persistMessages = identity.source !== "api";

  const messages = rawMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map(convertVercelMessageToLangChainMessage);

  /* ---------- THREAD ID ---------- */
  const bodyThreadId = params.threadId ?? null;
  const threadId = bodyThreadId ?? crypto.randomUUID();
  const isNewThread = bodyThreadId === null;

  /* ---------- PERSIST USER MESSAGE ---------- */
  const lastUserMsg = [...rawMessages].reverse().find((m) => m.role === "user");
  const lastUserContent = extractText(lastUserMsg ?? {});

  if (persistMessages && lastUserContent) {
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

  /* ---------- AGENT ---------- */
  const agent = createReactAgent({
    llm: llmAgent(),
    tools: createAgentTools(),
    messageModifier: new SystemMessage(AGENT_SYSTEM_CONTENT),
  });

  const agentConfig = {
    recursionLimit: 50,
    configurable: {
      thread_id: `user-${userId}-${Date.now()}`,
    },
  };

  const meterUsage = () =>
    void reportUsage({
      userId: identity.userId,
      orgId: identity.orgId,
      apiKeyId: identity.apiKeyId,
      source: identity.source,
      environment: identity.environment,
      usageType: "orchestrator",
      quantity: 1,
    }).catch(() => {});

  /* ======================================================
     MOBILE — NON-STREAMING (RN SAFE)
     ====================================================== */
  if (clientType === "mobile") {
    const mobileStartTime = Date.now();

    let result: Awaited<ReturnType<typeof agent.invoke>>;
    try {
      result = await agent.invoke({ messages }, agentConfig);
    } catch (e) {
      const errorInfo = errorTracker.trackError(
        e as Error,
        "Agent execution (mobile)",
        undefined,
        userId,
        undefined,
        "agents-mobile-execution",
      );
      return respondError({
        code: "AGENT_EXECUTION_FAILED",
        message: "The agent failed to complete the request.",
        status: 500,
        requestId: errorInfo?.id ?? null,
      });
    }

    const mobileElapsed = ((Date.now() - mobileStartTime) / 1000).toFixed(2);
    console.log(`✅ [Agents] Mobile agent completed in ${mobileElapsed}s for user ${userId}`);

    meterUsage();

    const lastUser = [...result.messages].reverse().find((m) => m._getType?.() === "human");
    const lastAssistant = [...result.messages].reverse().find((m) => m._getType?.() === "ai");

    const assistantContent =
      typeof lastAssistant?.content === "string"
        ? lastAssistant.content
        : lastAssistant
          ? JSON.stringify(lastAssistant.content)
          : "";

    // Run the answer through the review gate before it leaves the server: the
    // deterministic repairs the agent's output needs, plus the completeness and
    // grounding checks. Non-artifact answers pass through untouched.
    //
    // Failing here must cost the caller nothing more than an un-reviewed
    // answer, so the un-reviewed text is the fallback rather than an error.
    let finalized;
    try {
      finalized = await finalizeAssistantAnswer({
        text: assistantContent,
        toolMessages: collectToolMessages(result.messages),
        userId,
      });
    } catch (reviewErr) {
      console.error("[Agents] Review failed (mobile):", reviewErr);
      errorTracker.trackError(
        reviewErr as Error,
        "artifact review (mobile)",
        undefined,
        userId,
        undefined,
        "agents-review",
      );
      finalized = null;
    }

    const assistantPayload: string | PriorAuthArtifact =
      finalized?.payload ?? assistantContent;

    // Persist what we actually returned, so replaying the thread from history
    // shows the reviewed artifact rather than the original.
    const persistedContent = finalized?.persistText ?? assistantContent;

    if (persistMessages && persistedContent) {
      const persistUserId = userId;
      waitUntil(
        (async () => {
          try {
            await supabaseAdmin.from("chat_messages").insert({
              user_id: persistUserId,
              thread_id: threadId,
              role: "assistant",
              content: persistedContent,
              status: "complete",
              is_thread_starter: false,
            });
          } catch (persistErr) {
            console.error("Failed to persist assistant message:", persistErr);
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

    const responseMessages: AgentResponseMessage[] = [];
    if (lastUser) {
      responseMessages.push({
        role: "user",
        content:
          typeof lastUser.content === "string"
            ? lastUser.content
            : JSON.stringify(lastUser.content),
      });
    }
    if (lastAssistant) {
      responseMessages.push({ role: "assistant", content: assistantPayload });
    }

    const body: AgentJsonResponse = { threadId, messages: responseMessages };

    return NextResponse.json(body, {
      headers: { ...baseHeaders, "x-thread-id": threadId },
    });
  }

  /* ======================================================
     WEB / API — STREAMING
     ====================================================== */
  const encoder = new TextEncoder();
  console.log(`[Agents] Starting streaming for user ${userId}`);

  const streamAbort = new AbortController();
  {
    const signalAsTarget = streamAbort.signal as unknown as EventTarget & {
      setMaxListeners?: (n: number) => void;
    };
    if (signalAsTarget.setMaxListeners) signalAsTarget.setMaxListeners(100);
  }
  const eventStream = agent.streamEvents(
    { messages },
    { version: "v2", signal: streamAbort.signal, ...agentConfig },
  );

  let clientCancelled = false;

  const readable = new ReadableStream({
    async start(controller) {
      let streamCompleted = false;
      let firstChunkTime: number | null = null;
      let chunkCount = 0;
      let accumulated = "";

      // Raw output of every evidence-bearing tool call, tagged with the tool
      // that produced it — the extractor dispatches on the name because the
      // shapes differ (see lib/priorAuth/review/evidence).
      const toolMessages: ToolMessageRecord[] = [];

      /**
       * Writing to a controller that has already been errored or closed
       * throws. Since every write below happens in a `finally`, an unguarded
       * throw would skip `controller.close()` and leave the response hanging
       * open forever — a far worse outcome than a dropped progress frame.
       */
      const safeEnqueue = (text: string): boolean => {
        try {
          controller.enqueue(encoder.encode(text));
          return true;
        } catch {
          return false;
        }
      };

      /**
       * The answer is withheld until it has been reviewed, so exactly one
       * flush may ever happen. A second would duplicate the artifact in the
       * client's message buffer; none at all would deliver an empty response.
       */
      let flushed = false;
      /** exactly what the client received, which may not be what we persist */
      let sentText = "";
      const flush = (text: string) => {
        if (flushed || clientCancelled || !text) return;
        flushed = true;
        if (safeEnqueue(text)) sentText = text;
      };

      // Both routes cap out at maxDuration = 300. Because nothing is sent
      // until the end now, being killed at the cap would deliver *nothing*
      // rather than a partial answer. Give up on reviewing before that
      // happens and send what we have.
      const watchdog: ReturnType<typeof setTimeout> = setTimeout(() => {
        if (!flushed && accumulated) {
          console.warn(`[Agents] Watchdog flush (un-reviewed) for user ${userId}`);
          flush(accumulated);
        }
      }, WATCHDOG_MS);

      // A pending 270s timer keeps the Node event loop alive on its own, which
      // would hold the function open long after the response is done. It only
      // ever needs to fire while the stream is still running, so it should not
      // be a reason for the process to stay up.
      watchdog.unref?.();

      try {
        for await (const { event, name, data } of eventStream) {
          if (event === "on_tool_start" && typeof name === "string") {
            safeEnqueue(encodeFrame({ t: "tool", name, status: "running" }));
          }
          if (event === "on_tool_end" && typeof name === "string") {
            safeEnqueue(encodeFrame({ t: "tool", name, status: "done" }));
            if (EVIDENCE_TOOLS.has(name)) {
              const output = (data as { output?: unknown })?.output;
              const text =
                typeof output === "string"
                  ? output
                  : typeof (output as { content?: unknown })?.content === "string"
                    ? ((output as { content: string }).content)
                    : null;
              if (text) toolMessages.push({ name, content: text });
            }
          }
          if (
            event === "on_chat_model_stream" &&
            typeof data?.chunk?.content === "string" &&
            data.chunk.content.length > 0
          ) {
            if (!firstChunkTime) {
              firstChunkTime = Date.now();
              const ttf = ((firstChunkTime - streamStartTime) / 1000).toFixed(2);
              console.log(`[Agents] First chunk after ${ttf}s for user ${userId}`);
            }
            chunkCount++;
            // Accumulate only. The artifact is not sent token-by-token any
            // more: an answer cannot be checked for completeness until it is
            // complete, and it cannot be corrected once it has been sent.
            accumulated += data.chunk.content;
          }
        }
        streamCompleted = true;
        const totalElapsed = ((Date.now() - streamStartTime) / 1000).toFixed(2);
        console.log(
          `✅ [Agents] Stream completed in ${totalElapsed}s (${chunkCount} chunks) for user ${userId}`,
        );
      } catch (err) {
        const errorElapsed = ((Date.now() - streamStartTime) / 1000).toFixed(2);
        console.error(`❌ [Agents] Stream error after ${errorElapsed}s for user ${userId}:`, err);
        controller.error(err);
      } finally {
        clearTimeout(watchdog);
        if (streamCompleted) meterUsage();

        // Un-reviewed text is the fallback for every failure below. A review
        // that throws must cost the caller a worse answer, never no answer.
        let outText = accumulated;

        if (streamCompleted && !clientCancelled && accumulated && !flushed) {
          try {
            // Only announce a review phase for something reviewable. A plain
            // markdown answer has nothing to check, and it should reach the
            // client byte-identical to what the model wrote.
            if (looksLikeArtifact(accumulated)) {
              safeEnqueue(encodeFrame({ t: "phase", v: "reviewing" }));
            }
            const finalized = await finalizeAssistantAnswer({
              text: accumulated,
              toolMessages,
              userId,
            });
            outText = finalized.persistText;
          } catch (reviewErr) {
            console.error("[Agents] Review failed (web):", reviewErr);
            errorTracker.trackError(
              reviewErr as Error,
              "artifact review (web)",
              undefined,
              userId,
              undefined,
              "agents-review",
            );
          }
        }

        flush(outText);

        // If the watchdog already sent a truncated answer, the client is
        // holding less than `outText`. Persisting the fuller version would make
        // the on-screen report, the PDF export, and the saved history disagree
        // with no way to tell which is real — so record what was actually
        // delivered, and mark it partial.
        const truncatedDelivery = sentText !== "" && sentText !== outText;
        if (truncatedDelivery) {
          console.warn(
            `[Agents] Delivered a truncated answer to user ${userId}; persisting what was sent`,
          );
        }
        const persistText = truncatedDelivery ? sentText : outText;

        // Persist the reviewed body only — progress frames are transient and
        // must not end up in history or in a saved query.
        if (persistMessages && persistText) {
          try {
            await supabaseAdmin.from("chat_messages").insert({
              user_id: userId,
              thread_id: threadId,
              role: "assistant",
              content: persistText,
              status:
                streamCompleted && !clientCancelled && !truncatedDelivery
                  ? "complete"
                  : "partial",
              is_thread_starter: false,
            });
          } catch (persistErr) {
            console.error("Failed to persist assistant message:", persistErr);
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

        // Closing an already-errored controller throws; the stream is
        // finished either way and the caller must not be left hanging.
        try {
          controller.close();
        } catch {
          /* already closed or errored */
        }
      }
    },
    cancel(reason) {
      clientCancelled = true;
      console.log(`[Agents] Client cancelled stream for user ${userId}:`, reason);
      streamAbort.abort();
    },
  });

  return new StreamingTextResponse(readable, {
    headers: {
      ...baseHeaders,
      "Content-Type": "text/plain; charset=utf-8",
      "x-thread-id": threadId,
    },
  });
}
