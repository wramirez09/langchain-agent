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

import { AGENT_SYSTEM_CONTENT } from "./agentPrompt";
import { NCDCoverageSearchTool } from "./tools/NCDCoverageSearchTool";
import { localLcdSearchTool } from "./tools/localLcdSearchTool";
import { localCoverageArticleSearchTool } from "./tools/localArticleSearchTool";
import { policyContentExtractorTool } from "./tools/policyContentExtractorTool";
import { createCommercialGuidelineSearchTool } from "./tools/CommercialGuidelineSearchTool";
import { FileUploadTool } from "./tools/fileUploadTool";
import { reportUsage } from "@/lib/usage";
import { getUserFromRequest } from "../../../../lib/auth/getUserFromRequest";
import { withRetry, RETRY_CONFIGS } from "@/lib/retry";
import { errorTracker, trackRetryError, createClientErrorNotification } from "@/lib/error-tracking";

/* -------------------- CORS -------------------- */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

/* -------------------- OPTIONS -------------------- */
export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

/* -------------------- MESSAGE CONVERSION -------------------- */
const convertVercelMessageToLangChainMessage = (
  message: VercelChatMessage | any,
) => {
  let content = message.content;

  if ((!content || content === "") && Array.isArray(message.parts)) {
    content = message.parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("\n");
  }

  const text = content ? String(content) : "";

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
    
    console.log(`[Agents API] Request started for user ${userId} at ${new Date().toISOString()}`);

    /* ---------- REQUEST ---------- */
    const body = await req.json();
    const clientType = req.headers.get("x-client") ?? "web";

    const messages = (body.messages ?? [])
      .filter(
        (m: VercelChatMessage) => m.role === "user" || m.role === "assistant",
      )
      .map(convertVercelMessageToLangChainMessage);

    /* ---------- TOOLS ---------- */
    // Initialize commercial guideline search tool (documents pre-loaded at module scope)
    const commercialGuidelineTool = createCommercialGuidelineSearchTool();
    
    const tools = [
      new SerpAPI(),
      commercialGuidelineTool,
      new NCDCoverageSearchTool(),
      localLcdSearchTool,
      localCoverageArticleSearchTool,
      policyContentExtractorTool,
      new FileUploadTool(),
    ];

    /* ---------- AGENT ---------- */
    const agent = createReactAgent({
      llm: llmAgent(),
      tools,
      messageModifier: new SystemMessage(AGENT_SYSTEM_CONTENT),
    });

    // Configure agent execution with extended timeout
    const agentConfig = {
      recursionLimit: 50, // Increase from default 25 to allow more tool calls
      configurable: {
        thread_id: `user-${userId}-${Date.now()}`,
      },
    };

    /* ======================================================
     MOBILE — NON-STREAMING (RN SAFE)
     ====================================================== */
    if (clientType === "mobile") {
      const mobileStartTime = Date.now();
      console.log(`[Agents API] Starting mobile agent execution for user ${userId}`);
      
      const agentResult = await withRetry(
        async () => {
          const result = await agent.invoke({ messages }, agentConfig);
          return result;
        },
        {
          ...RETRY_CONFIGS.LLM_API,
          maxAttempts: 5, // Increase retries for mobile
          initialDelay: 2000, // Longer initial delay
          context: "Agent execution (mobile)",
          onRetry: (attempt, error) => {
            const elapsed = ((Date.now() - mobileStartTime) / 1000).toFixed(2);
            console.warn(`⚠️ [Agents API] Mobile retry ${attempt} for user ${userId} after ${elapsed}s:`, error.message);
          }
        }
      );

      if (!agentResult.success || !agentResult.data) {
        const errorInfo = trackRetryError(
          agentResult.error || new Error("Failed to execute agent"),
          "Agent execution (mobile)",
          agentResult.attempts,
          userId,
          "agents-mobile-execution"
        );
        
        const clientNotification = createClientErrorNotification(errorInfo);
        
        return NextResponse.json(
          { 
            error: clientNotification.userMessage,
            technicalError: clientNotification.technicalMessage,
            retryAttempts: clientNotification.retryAttempts,
            canRetry: clientNotification.canRetry
          },
          { status: 500, headers: corsHeaders }
        );
      }

      const result = agentResult.data;
      const mobileElapsed = ((Date.now() - mobileStartTime) / 1000).toFixed(2);
      console.log(`✅ [Agents API] Mobile agent completed in ${mobileElapsed}s for user ${userId}`);
      console.log({ result });

      // Report usage only after successful agent completion
      void reportUsage({ userId: userId!, usageType: "orchestrator", quantity: 1 }).catch(() => {});

      // Get last user + last assistant messages
      const lastUser = [...result.messages]
        .reverse()
        .find((m) => m._getType?.() === "human");

      const lastAssistant = [...result.messages]
        .reverse()
        .find((m) => m._getType?.() === "ai");

      return NextResponse.json(
        {
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
        { headers: corsHeaders },
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
    const eventStream = agent.streamEvents(
      { messages }, 
      { 
        version: "v2",
        ...agentConfig
      }
    );

    const readable = new ReadableStream({
      async start(controller) {
        let streamCompleted = false;
        let firstChunkTime: number | null = null;
        let chunkCount = 0;
        
        try {
          for await (const { event, data } of eventStream) {
            if (
              event === "on_chat_model_stream" &&
              typeof data?.chunk?.content === "string" &&
              data.chunk.content.length > 0
            ) {
              if (!firstChunkTime) {
                firstChunkTime = Date.now();
                const timeToFirstChunk = ((firstChunkTime - streamStartTime) / 1000).toFixed(2);
                console.log(`[Agents API] First chunk received after ${timeToFirstChunk}s for user ${userId}`);
              }
              chunkCount++;
              controller.enqueue(encoder.encode(data.chunk.content));
            }
          }
          streamCompleted = true;
          const totalElapsed = ((Date.now() - streamStartTime) / 1000).toFixed(2);
          console.log(`✅ [Agents API] Stream completed in ${totalElapsed}s (${chunkCount} chunks) for user ${userId}`);
        } catch (err) {
          const errorElapsed = ((Date.now() - streamStartTime) / 1000).toFixed(2);
          console.error(`❌ [Agents API] Stream error after ${errorElapsed}s for user ${userId}:`, err);
          controller.error(err);
        } finally {
          // Report usage only after a full successful stream
          if (streamCompleted) {
            void reportUsage({ userId: userId!, usageType: "orchestrator", quantity: 1 }).catch(() => {});
          }
          controller.close();
        }
      },
    });

    return new StreamingTextResponse(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (e: unknown) {
    const error = e as Error;
    const requestElapsed = ((Date.now() - requestStartTime) / 1000).toFixed(2);
    console.error(`❌ [Agents API] Request failed after ${requestElapsed}s for user ${userId}:`, error.message);
    
    const errorInfo = errorTracker.trackError(
      error,
      "Agents API request",
      undefined,
      userId,
      undefined,
      "agents-api-request"
    );
    
    const clientNotification = createClientErrorNotification(errorInfo);
    
    return NextResponse.json(
      { 
        error: clientNotification.userMessage,
        technicalError: clientNotification.technicalMessage,
        retryAttempts: clientNotification.retryAttempts,
        canRetry: clientNotification.canRetry
      },
      { status: (error as any).status ?? 500, headers: corsHeaders }
    );
  }
}
