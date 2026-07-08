/** Who is making the call, for persistence + usage attribution. */
export type CallerIdentity = {
  /** Supabase user id used for chat_messages + usage_logs.user_id. For API
   *  calls this is the key creator (`created_by`). */
  userId: string;
  /** Billing tenant. Present for public API calls; omitted for first-party
   *  web/mobile (which bill the user's own subscription). */
  orgId?: string;
  apiKeyId?: string;
  source: "web" | "mobile" | "api";
};

import type { PriorAuthArtifact } from "@/lib/priorAuth/artifactSchema";

/**
 * A message in the agents JSON response. The assistant's `content` mirrors the
 * web client: a structured `PriorAuthArtifact` when the agent returns its final
 * answer as the JSON artifact, or a plain string for a text/markdown reply.
 */
export type AgentResponseMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | PriorAuthArtifact };

/** Default (non-streaming) JSON body returned by the agents endpoints. */
export type AgentJsonResponse = {
  threadId: string;
  messages: AgentResponseMessage[];
};

/** Lets each surface render error responses in its own envelope + headers. */
export type ErrorResponder = (args: {
  code: string;
  message: string;
  status: number;
  requestId?: string | null;
}) => Response;
