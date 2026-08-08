import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { SystemMessage } from "@langchain/core/messages";

import { llmAgent } from "@/lib/llm";
import { reportUsage } from "@/lib/usage";
import { CHAT_SYSTEM_CONTENT } from "@/app/api/chat/agents/agentPrompt";

import { createAgentTools, convertVercelMessageToLangChainMessage } from "./runAgent";
import type { CallerIdentity } from "./types";

/** Thrown when the chat stream can't be created after retries; carries the
 *  retry metadata so the internal route can render its detailed envelope. */
export class ChatStreamError extends Error {
  attempts: number;
  cause?: Error;
  constructor(message: string, attempts: number, cause?: Error) {
    super(message);
    this.name = "ChatStreamError";
    this.attempts = attempts;
    this.cause = cause;
  }
}

/**
 * Core chat handler shared by the internal route (app/api/chat) and the public
 * API route (app/api/v1/chat). Returns a byte stream of the assistant's
 * markdown answer, with usage metered on completion. Throws
 * {@link ChatStreamError} if the stream can't be established. Auth + error
 * envelopes stay in the route.
 *
 * This runs the SAME LangGraph agent and toolset as /agents — Medicare NCD /
 * LCD / LCA, the commercial guideline corpus, policy extraction — and differs
 * only in the output half of the system prompt: markdown here, the structured
 * artifact there. It used to be a bare `prompt -> model -> parser` chain with
 * no tools at all, so every answer was the model's unaided recall: plausible
 * prose, invented codes, and none of the payer thresholds that make a
 * prior-auth answer worth anything. Callers could not tell, because the shape
 * of the response was identical.
 */
export async function runChat(params: {
  messages: any[];
  identity: CallerIdentity;
}): Promise<ReadableStream<Uint8Array>> {
  const { messages, identity } = params;

  const agent = createReactAgent({
    llm: llmAgent(),
    tools: createAgentTools(),
    messageModifier: new SystemMessage(CHAT_SYSTEM_CONTENT),
  });

  const lcMessages = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map(convertVercelMessageToLangChainMessage);

  const abort = new AbortController();
  {
    // The graph attaches a listener per step; the default cap warns at 10.
    const signal = abort.signal as unknown as EventTarget & {
      setMaxListeners?: (n: number) => void;
    };
    if (signal.setMaxListeners) signal.setMaxListeners(100);
  }

  let eventStream: AsyncIterable<{ event: string; data: any }>;
  try {
    eventStream = agent.streamEvents(
      { messages: lcMessages },
      {
        version: "v2",
        signal: abort.signal,
        recursionLimit: 50,
        configurable: { thread_id: `chat-${identity.userId}-${Date.now()}` },
      },
    );
  } catch (err) {
    throw new ChatStreamError("Failed to create chat stream", 1, err as Error);
  }

  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let completed = false;
      try {
        for await (const { event, data } of eventStream) {
          // Only the model's own text is forwarded. Tool-calling turns stream
          // empty content (the call rides in additional_kwargs), so the caller
          // sees the answer, never the intermediate steps or their sources.
          if (
            event === "on_chat_model_stream" &&
            typeof data?.chunk?.content === "string" &&
            data.chunk.content.length > 0
          ) {
            controller.enqueue(encoder.encode(data.chunk.content));
          }
        }
        completed = true;
      } catch (err) {
        console.error(`❌ [Chat] Stream error for user ${identity.userId}:`, err);
        controller.error(err);
        return;
      } finally {
        // Meter only a run that produced an answer, matching /agents.
        if (completed) {
          void reportUsage({
            userId: identity.userId,
            orgId: identity.orgId,
            apiKeyId: identity.apiKeyId,
            source: identity.source,
            environment: identity.environment,
            usageType: "chat",
            quantity: 1,
          }).catch((err) => console.error("Failed to report usage from chat:", err));
        }
      }
      controller.close();
    },
    cancel() {
      abort.abort();
    },
  });
}
