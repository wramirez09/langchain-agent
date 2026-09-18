import type { ApiAuthContext } from "@/lib/auth/resolveApiAuth";

/**
 * Which existing API-key scope each MCP tool requires.
 *
 * MCP deliberately reuses `agents` / `chat` rather than introducing an `mcp`
 * scope. Every key ever issued was created with `scopes` defaulting to
 * `{agents,chat}` and `app/api/keys` only accepts those two values, so a
 * strict `scopes.includes("mcp")` would reject every existing key and force a
 * migration, a UI change and a "regenerate your key" support burden — for no
 * security gain, since the MCP tools expose exactly the capabilities those
 * scopes already grant over REST. Add a scope when MCP grows a capability
 * REST lacks.
 *
 * `null` means no scope required, mirroring `/api/v1/me`.
 */
export const TOOL_SCOPES: Record<string, readonly string[] | null> = {
  // Retrieval — the same corpora `/v1/chat` and `/v1/agents` search.
  medicare_multi_search: ["agents", "chat"],
  ncd_coverage_search: ["agents", "chat"],
  local_lcd_search: ["agents", "chat"],
  local_coverage_article_search: ["agents", "chat"],
  medicare_policy_detail: ["agents", "chat"],
  commercial_guidelines_search: ["agents", "chat"],
  policy_content_extractor: ["agents", "chat"],
  // Full screening *is* `/api/v1/agents`, so it takes that endpoint's scope.
  run_prior_auth_screening: ["agents"],
  // Key introspection, like `/api/v1/me`.
  whoami: null,
  usage: null,
};

/** The scopes that grant access to the MCP endpoint at all. */
const ENDPOINT_SCOPES = ["agents", "chat"] as const;

/**
 * Endpoint gate. A key with neither `agents` nor `chat` can reach no tool
 * worth listing, so it is refused at the door rather than handed an empty
 * tool list it cannot act on.
 */
export function hasAnyMcpScope(auth: ApiAuthContext): boolean {
  return ENDPOINT_SCOPES.some((s) => auth.scopes.includes(s));
}

/**
 * Whether this key may call `name`.
 *
 * A tool the caller cannot use is simply **not registered** on that request's
 * server instance (the factory receives `authInfo`, so visibility is decided
 * per request). A caller therefore never sees a tool that would 403 — better
 * than advertising it and failing the call.
 */
export function canUse(auth: ApiAuthContext, name: string): boolean {
  const required = TOOL_SCOPES[name];
  if (required === undefined) return false;
  if (required === null) return true;
  return required.some((s) => auth.scopes.includes(s));
}

/**
 * Guideline resources expose full commercial-payer criteria bodies — the very
 * field `CommercialGuidelineSearchTool.redactResult` strips from search output
 * — and MCP resources are trivially bulk-read. Default OFF so enabling it is a
 * named product decision rather than a side effect of shipping MCP.
 */
export function resourcesEnabled(): boolean {
  return process.env.MCP_EXPOSE_GUIDELINE_RESOURCES === "true";
}
