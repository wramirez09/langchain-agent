import { NextRequest, NextResponse } from "next/server";
import { Message as VercelChatMessage, StreamingTextResponse } from "ai";

import { llmAgent } from "@/lib/llm";
import { PromptTemplate } from "@langchain/core/prompts";
import { HttpResponseOutputParser } from "langchain/output_parsers";
import { createClient } from "@/utils/server";
import { reportUsage } from "@/lib/usage";
import { withRetry, RETRY_CONFIGS } from "@/lib/retry";
import { errorTracker, trackRetryError, createClientErrorNotification } from "@/lib/error-tracking";



const formatMessage = (message: VercelChatMessage) => {
  return `${message.role}: ${message.content}`;
};

const TEMPLATE = `You are a healthcare provider assisting others in obtaining information for medical insurance preauthorization.

Current conversation:
{chat_history}

User: {input}
AI:`;

/**
 * This handler initializes and calls a simple chain with a prompt,
 * chat model, and output parser. See the docs for more information:
 *
 * https://js.langchain.com/docs/guides/expression_language/cookbook#prompttemplate--llm--outputparser
 */
export async function POST(req: NextRequest) {
  let userId: string | undefined;
  
  try {
    // Get user ID for error tracking
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id;
    } catch (authError) {
      console.warn("Could not get user for error tracking:", authError);
    }

    const body = await req.json();
    const messages = body.messages ?? [];
    const formattedPreviousMessages = messages.slice(0, -1).map(formatMessage);
    const currentMessageContent = messages[messages.length - 1].content;
    const prompt = PromptTemplate.fromTemplate(TEMPLATE);

    /**
     * You can also try e.g.:
     *
     * import { ChatAnthropic } from "@langchain/anthropic";
     * const model = new ChatAnthropic({});
     *
     * See a full list of supported models at:
     * https://js.langchain.com/docs/modules/model_io/models/
     */
    const model = llmAgent;

    /**
     * Chat models stream message chunks rather than bytes, so this
     * output parser handles serialization and byte-encoding.
     */
    const outputParser = new HttpResponseOutputParser();

    /**
     * Can also initialize as:
     *
     * import { RunnableSequence } from "@langchain/core/runnables";
     * const chain = RunnableSequence.from([prompt, model, outputParser]);
     */
    const chain = prompt.pipe(llmAgent()).pipe(outputParser);

    // Wrap the chain execution with retry logic
    const streamResult = await withRetry(
      async () => {
        const stream = await chain.stream({
          chat_history: formattedPreviousMessages.join("\n"),
          input: currentMessageContent,
        });
        return stream;
      },
      {
        ...RETRY_CONFIGS.LLM_API,
        context: "Chat completion",
        onRetry: (attempt, error) => {
          console.warn(`⚠️ [Chat API] Retry ${attempt} for user ${userId}:`, error.message);
        }
      }
    );

    if (!streamResult.success || !streamResult.data) {
      const errorInfo = trackRetryError(
        streamResult.error || new Error("Failed to create chat stream"),
        "Chat completion",
        streamResult.attempts,
        userId,
        "chat-completion"
      );
      
      // Create client notification
      const clientNotification = createClientErrorNotification(errorInfo);
      
      return NextResponse.json(
        { 
          error: clientNotification.userMessage,
          technicalError: clientNotification.technicalMessage,
          retryAttempts: clientNotification.retryAttempts,
          canRetry: clientNotification.canRetry
        }, 
        { status: 500 }
      );
    }

    const stream = streamResult.data;

    // Report usage only after the stream fully completes (not before sending).
    // Using a passthrough TransformStream so the flush callback fires on completion.
    const reportingTransform = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
      },
      flush() {
        if (userId) {
          void reportUsage({ userId, usageType: "chat", quantity: 1 }).catch((err) => {
            console.error("Failed to report usage from /api/chat:", err);
          });
        }
      },
    });

    return new StreamingTextResponse(stream.pipeThrough(reportingTransform));
  } catch (e: unknown) {
    const error = e as Error;
    const errorInfo = errorTracker.trackError(
      error,
      "Chat API request",
      undefined,
      userId,
      undefined,
      "chat-api-request"
    );
    
    // Create client notification
    const clientNotification = createClientErrorNotification(errorInfo);
    
    return NextResponse.json(
      { 
        error: clientNotification.userMessage,
        technicalError: clientNotification.technicalMessage,
        retryAttempts: clientNotification.retryAttempts,
        canRetry: clientNotification.canRetry
      }, 
      { status: (error as any).status ?? 500 }
    );
  }
}
