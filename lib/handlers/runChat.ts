import { PromptTemplate } from "@langchain/core/prompts";
import { HttpResponseOutputParser } from "langchain/output_parsers";

import { llmAgent } from "@/lib/llm";
import { reportUsage } from "@/lib/usage";
import { withRetry, RETRY_CONFIGS } from "@/lib/retry";

import type { CallerIdentity } from "./types";

const formatMessage = (message: any) => `${message.role}: ${message.content}`;

const TEMPLATE = `You are a healthcare provider assisting others in obtaining information for medical insurance preauthorization.

Current conversation:
{chat_history}

User: {input}
AI:`;

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
 * Core simple-chat chain shared by the internal route (app/api/chat) and the
 * public API route (app/api/v1/chat). Returns a byte stream with usage metering
 * applied on completion. Throws {@link ChatStreamError} if the stream can't be
 * established. Auth + error envelopes stay in the route.
 */
export async function runChat(params: {
  messages: any[];
  identity: CallerIdentity;
}): Promise<ReadableStream<Uint8Array>> {
  const { messages, identity } = params;

  const formattedPreviousMessages = messages.slice(0, -1).map(formatMessage);
  const currentMessageContent = messages[messages.length - 1].content;

  const prompt = PromptTemplate.fromTemplate(TEMPLATE);
  const outputParser = new HttpResponseOutputParser();
  const chain = prompt.pipe(llmAgent()).pipe(outputParser);

  const streamResult = await withRetry(
    async () =>
      chain.stream({
        chat_history: formattedPreviousMessages.join("\n"),
        input: currentMessageContent,
      }),
    {
      ...RETRY_CONFIGS.LLM_API,
      context: "Chat completion",
      onRetry: (attempt, error) => {
        console.warn(`⚠️ [Chat] Retry ${attempt} for user ${identity.userId}:`, error.message);
      },
    },
  );

  if (!streamResult.success || !streamResult.data) {
    throw new ChatStreamError(
      "Failed to create chat stream",
      streamResult.attempts,
      streamResult.error,
    );
  }

  // Report usage only after the stream fully completes (flush fires on done).
  const reportingTransform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);
    },
    flush() {
      void reportUsage({
        userId: identity.userId,
        orgId: identity.orgId,
        apiKeyId: identity.apiKeyId,
        source: identity.source,
        usageType: "chat",
        quantity: 1,
      }).catch((err) => console.error("Failed to report usage from chat:", err));
    },
  });

  return streamResult.data.pipeThrough(reportingTransform);
}
