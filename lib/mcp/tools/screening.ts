import { createHash } from "crypto";
import { z } from "zod";
import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";

import * as idempotency from "@/lib/api/idempotency";
import { priorAuthArtifactSchema } from "@/lib/priorAuth/artifactSchema";
import type { AgentJsonResponse, ErrorResponder } from "@/lib/handlers/types";

import { toolError } from "../adapt";
import type { McpCallContext } from "../context";
import { truncateForClient } from "../limits";
import { canUse } from "../policy";

/** Same per-message cap the internal and public agent routes enforce. */
const MAX_MESSAGE_CHARS = 100_000;

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(MAX_MESSAGE_CHARS),
});

const InputSchema = z.object({
  messages: z
    .array(MessageSchema)
    .min(1)
    .max(200)
    .describe(
      "The conversation so far, oldest first, ending with the current question. This endpoint keeps no history, so resend earlier turns to ask a follow-up.",
    ),
  threadId: z
    .string()
    .uuid()
    .optional()
    .describe("The `threadId` from a previous screening, to group related runs in reporting."),
});

const OutputSchema = z.object({
  threadId: z.string(),
  artifact: priorAuthArtifactSchema.nullable(),
  text: z.string().nullable(),
});

/**
 * Emit `notifications/progress` while a screening runs.
 *
 * A full run takes 45-65 seconds against client timeouts that are often 60.
 * These notifications reset most clients' idle timers, and under the handler's
 * default `auto` response mode the first one upgrades the HTTP response to SSE,
 * which keeps intermediaries from timing the connection out either.
 */
function startProgress(ctx: ServerContext): () => void {
  const token = ctx.mcpReq._meta?.progressToken;
  if (token === undefined) return () => {};

  const started = Date.now();
  const timer = setInterval(() => {
    void ctx.mcpReq
      .notify({
        method: "notifications/progress",
        params: {
          progressToken: token,
          progress: Math.round((Date.now() - started) / 1000),
          message: "Researching coverage policy…",
        },
      })
      .catch(() => undefined);
  }, 10_000);

  return () => clearInterval(timer);
}

/** Shape one completed `{ threadId, messages }` body into a tool result. */
function toResult(body: AgentJsonResponse): CallToolResult {
  const last = [...body.messages].reverse().find((m) => m.role === "assistant");
  const content = last?.content ?? null;

  // `isPriorAuthArtifact` is only a discriminator check, so it can pass for a
  // payload the schema would reject — and `structuredContent` is validated
  // against `OutputSchema` by the SDK. Parse for real and fall back to text,
  // so a partial artifact degrades into a readable answer instead of failing
  // a run the caller was already billed for.
  const parsed =
    content && typeof content === "object" ? priorAuthArtifactSchema.safeParse(content) : null;

  const out =
    parsed?.success === true
      ? { threadId: body.threadId, artifact: parsed.data, text: null }
      : {
          threadId: body.threadId,
          artifact: null,
          text: typeof content === "string" ? content : content ? JSON.stringify(content) : null,
        };

  return {
    // A text block alongside `structuredContent`: clients that predate
    // structured output still need something to render.
    content: [{ type: "text", text: truncateForClient(JSON.stringify(out)) }],
    structuredContent: out,
  };
}

export function registerScreeningTool(server: McpServer, ctx: McpCallContext): void {
  const { auth } = ctx;
  if (!canUse(auth, "run_prior_auth_screening")) return;

  server.registerTool(
    "run_prior_auth_screening",
    {
      title: "Run a prior authorization screening",
      description:
        "Run NoteDoctorAi's full prior authorization readiness screening: the agent researches Medicare and commercial-payer coverage itself and returns a structured determination — whether prior authorization is required, the criteria behind it, relevant CPT/ICD-10 codes, the documentation to gather, and the policies cited. Prefer this over the individual search tools when you want an answer rather than source documents. " +
        "A run takes 45-65 seconds; raise your client's tool timeout to 300s before calling it (in Claude Code, `MCP_TOOL_TIMEOUT=300000`). " +
        "Send clinical details only — no patient names, dates of birth, member IDs or other identifiers.",
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args, mcpCtx) => {
      /* ---------- IDEMPOTENCY ----------
       * MCP has no `Idempotency-Key` header, but a client that gives up at 60s
       * will retry, and every retry is a real billed 60-second run. Derive the
       * key from the inputs instead and reuse the REST machinery unchanged. */
      const derivedKey = createHash("sha256")
        .update(`${auth.orgId}:run_prior_auth_screening:${JSON.stringify(args)}`)
        .digest("hex");

      const idem = await idempotency.begin({
        key: derivedKey,
        orgId: auth.orgId,
        endpoint: "mcp/run_prior_auth_screening",
        body: args,
        errorResponse: (code, message, status) =>
          new Response(JSON.stringify({ code, message }), { status }),
      });

      if (idem.kind === "conflict") {
        // The key is derived from the body, so the fingerprint always matches
        // and a conflict can only mean "still running" — exactly the state a
        // retrying client is in.
        return toolError(
          "A screening with identical inputs is already running. Wait for it to finish rather than starting a second billed run.",
        );
      }

      if (idem.kind === "replay") {
        return toResult((await idem.response.json()) as AgentJsonResponse);
      }
      const commit = idem.kind === "proceed" ? idem.commit : async (r: Response) => r;

      /* ---------- EXECUTE ----------
       * Call `runAgent` and parse its Response rather than refactoring a
       * `runAgentCore` out of it: it is ~400 lines of watchdog, persistence and
       * truncation semantics that two routes and a test suite depend on, and a
       * JSON round-trip of a ~50 KB artifact costs microseconds against a
       * 50-second run.
       *
       * Lazy import — `runAgent` calls `startCmsWarmup()` at module scope, so a
       * static import would fire CMS fetches and an embedding preload on every
       * `tools/list`. */
      const { runAgent } = await import("@/lib/handlers/runAgent");

      let handled: { code: string; message: string; requestId?: string | null } | null = null;
      const respondError: ErrorResponder = (e) => {
        handled = e;
        return new Response(null, { status: e.status });
      };

      const stopProgress = startProgress(mcpCtx);
      try {
        const res = await commit(
          await runAgent({
            messages: args.messages,
            threadId: args.threadId ?? null,
            // "mobile" selects the non-streaming JSON branch.
            clientType: "mobile",
            identity: {
              userId: auth.createdBy,
              orgId: auth.orgId,
              apiKeyId: auth.apiKeyId,
              // Load-bearing: `runAgent` skips chat_messages persistence for
              // `source: "api"`, which is what keeps MCP traffic — third-party
              // text that may contain PHI — out of our custody. Never change
              // this here.
              source: "api",
              environment: auth.environment,
            },
            respondError,
          }),
        );

        if (handled) {
          const e = handled as { code: string; message: string; requestId?: string | null };
          const suffix = e.requestId ? ` (request ${e.requestId})` : "";
          return toolError(`${e.message}${suffix}`);
        }

        // No metering here on purpose: `runAgent` already reports
        // `usageType: "orchestrator"` for this run, and a second
        // `reportUsage` would double-bill it.
        return toResult((await res.json()) as AgentJsonResponse);
      } catch (e) {
        return toolError(`The screening could not be completed: ${(e as Error).message}`);
      } finally {
        stopProgress();
      }
    },
  );
}
