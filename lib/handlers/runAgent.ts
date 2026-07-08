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

import { isPriorAuthArtifact, type PriorAuthArtifact } from "@/lib/priorAuth/artifactSchema";

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

const convertVercelMessageToLangChainMessage = (message: any) => {
  const text = extractText(message);
  if (message.role === "user") return new HumanMessage(text);
  if (message.role === "assistant") return new AIMessage(text);
  return new ChatMessage(text, message.role);
};

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

  /* ---------- TOOLS ---------- */
  const commercialGuidelineTool = createCommercialGuidelineSearchTool();
  const tools = [
    new SerpAPI(),
    commercialGuidelineTool,
    medicareMultiSearchTool,
    new NCDCoverageSearchTool(),
    localLcdSearchTool,
    localCoverageArticleSearchTool,
    medicarePolicyDetailTool,
    policyContentExtractorTool,
  ];

  /* ---------- AGENT ---------- */
  const agent = createReactAgent({
    llm: llmAgent(),
    tools,
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

    if (persistMessages && assistantContent) {
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

    // Parse the assistant's final answer into the structured PriorAuth
    // artifact when it is one — the same typed shape the web client renders —
    // and fall back to raw text otherwise. Mirrors isPriorAuthArtifact() on
    // the client.
    const assistantPayload: string | PriorAuthArtifact = (() => {
      if (!assistantContent) return "";
      try {
        const parsed = JSON.parse(assistantContent);
        return isPriorAuthArtifact(parsed) ? parsed : assistantContent;
      } catch {
        return assistantContent;
      }
    })();

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

      try {
        for await (const { event, data } of eventStream) {
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
            accumulated += data.chunk.content;
            controller.enqueue(encoder.encode(data.chunk.content));
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
        if (streamCompleted) meterUsage();
        if (persistMessages && accumulated) {
          try {
            await supabaseAdmin.from("chat_messages").insert({
              user_id: userId,
              thread_id: threadId,
              role: "assistant",
              content: accumulated,
              status: streamCompleted && !clientCancelled ? "complete" : "partial",
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
        controller.close();
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
