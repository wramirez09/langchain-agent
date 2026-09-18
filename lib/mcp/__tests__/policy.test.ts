/**
 * @jest-environment node
 */
import type { ApiAuthContext } from "@/lib/auth/resolveApiAuth";
import { canUse, hasAnyMcpScope, resourcesEnabled, TOOL_SCOPES } from "../policy";

const authWith = (scopes: string[]): ApiAuthContext => ({
  orgId: "org-1",
  createdBy: "u1",
  apiKeyId: "k1",
  environment: "live",
  scopes,
  tier: "standard",
});

const RETRIEVAL = [
  "medicare_multi_search",
  "ncd_coverage_search",
  "local_lcd_search",
  "local_coverage_article_search",
  "medicare_policy_detail",
  "commercial_guidelines_search",
  "policy_content_extractor",
];

describe("hasAnyMcpScope", () => {
  it("admits agents-only and chat-only keys", () => {
    expect(hasAnyMcpScope(authWith(["agents"]))).toBe(true);
    expect(hasAnyMcpScope(authWith(["chat"]))).toBe(true);
    expect(hasAnyMcpScope(authWith(["agents", "chat"]))).toBe(true);
  });

  it("refuses a key with neither scope", () => {
    expect(hasAnyMcpScope(authWith([]))).toBe(false);
    expect(hasAnyMcpScope(authWith(["something-else"]))).toBe(false);
  });
});

describe("canUse", () => {
  it("gives a chat-only key every retrieval tool", () => {
    const auth = authWith(["chat"]);
    for (const name of RETRIEVAL) expect(canUse(auth, name)).toBe(true);
  });

  it("withholds the full screening from a chat-only key", () => {
    expect(canUse(authWith(["chat"]), "run_prior_auth_screening")).toBe(false);
    expect(canUse(authWith(["agents"]), "run_prior_auth_screening")).toBe(true);
    expect(canUse(authWith(["agents", "chat"]), "run_prior_auth_screening")).toBe(true);
  });

  it("gives account tools to any key, including a scopeless one", () => {
    for (const auth of [authWith([]), authWith(["chat"]), authWith(["agents"])]) {
      expect(canUse(auth, "whoami")).toBe(true);
      expect(canUse(auth, "usage")).toBe(true);
    }
  });

  it("denies a tool it has never heard of", () => {
    expect(canUse(authWith(["agents", "chat"]), "rm_rf")).toBe(false);
  });

  it("maps every published tool onto an existing key scope, never a new one", () => {
    for (const required of Object.values(TOOL_SCOPES)) {
      if (required === null) continue;
      for (const scope of required) expect(["agents", "chat"]).toContain(scope);
    }
  });
});

describe("resourcesEnabled", () => {
  const original = process.env.MCP_EXPOSE_GUIDELINE_RESOURCES;
  afterEach(() => {
    if (original === undefined) delete process.env.MCP_EXPOSE_GUIDELINE_RESOURCES;
    else process.env.MCP_EXPOSE_GUIDELINE_RESOURCES = original;
  });

  it("is off when unset, and off for anything but the literal 'true'", () => {
    delete process.env.MCP_EXPOSE_GUIDELINE_RESOURCES;
    expect(resourcesEnabled()).toBe(false);
    process.env.MCP_EXPOSE_GUIDELINE_RESOURCES = "false";
    expect(resourcesEnabled()).toBe(false);
    process.env.MCP_EXPOSE_GUIDELINE_RESOURCES = "1";
    expect(resourcesEnabled()).toBe(false);
  });

  it("is on only when explicitly enabled", () => {
    process.env.MCP_EXPOSE_GUIDELINE_RESOURCES = "true";
    expect(resourcesEnabled()).toBe(true);
  });
});
