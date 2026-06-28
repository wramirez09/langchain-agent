import { NextRequest, NextResponse } from "next/server";
import { StreamingTextResponse } from "ai";

import { createClient } from "@/utils/server";
import {
  errorTracker,
  trackRetryError,
  createClientErrorNotification,
} from "@/lib/error-tracking";
import { runChat, ChatStreamError } from "@/lib/handlers/runChat";

/**
 * Simple chat chain (prompt → model → output parser). Core lives in
 * lib/handlers/runChat so the public API route can reuse it.
 */
export async function POST(req: NextRequest) {
  let userId: string | undefined;

  try {
    // Get user ID for error tracking + usage attribution.
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id;
    } catch (authError) {
      console.warn("Could not get user for error tracking:", authError);
    }

    const body = await req.json();
    const messages = body.messages ?? [];

    const stream = await runChat({
      messages,
      identity: { userId: userId ?? "", source: "web" },
    });

    return new StreamingTextResponse(stream);
  } catch (e: unknown) {
    if (e instanceof ChatStreamError) {
      const errorInfo = trackRetryError(
        e.cause || new Error(e.message),
        "Chat completion",
        e.attempts,
        userId,
        "chat-completion",
      );
      const clientNotification = createClientErrorNotification(errorInfo);
      return NextResponse.json(
        {
          error: clientNotification.userMessage,
          technicalError: clientNotification.technicalMessage,
          retryAttempts: clientNotification.retryAttempts,
          canRetry: clientNotification.canRetry,
        },
        { status: 500 },
      );
    }

    const error = e as Error;
    const errorInfo = errorTracker.trackError(
      error,
      "Chat API request",
      undefined,
      userId,
      undefined,
      "chat-api-request",
    );
    const clientNotification = createClientErrorNotification(errorInfo);
    return NextResponse.json(
      {
        error: clientNotification.userMessage,
        technicalError: clientNotification.technicalMessage,
        retryAttempts: clientNotification.retryAttempts,
        canRetry: clientNotification.canRetry,
      },
      { status: (error as any).status ?? 500 },
    );
  }
}
