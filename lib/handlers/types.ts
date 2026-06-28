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

/** Lets each surface render error responses in its own envelope + headers. */
export type ErrorResponder = (args: {
  code: string;
  message: string;
  status: number;
  requestId?: string | null;
}) => Response;
