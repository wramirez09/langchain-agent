import type { McpServer } from "@modelcontextprotocol/server";

import { MedicareSearchInputSchema } from "@/app/api/chat/agents/tools/utils/medicareSearchTypes";
import { CommercialGuidelineSearchInputSchema } from "@/app/api/chat/agents/tools/utils/commercialGuidelineTypes";
import {
  MedicarePolicyDetailInputSchema,
  PolicyContentExtractorInputSchema,
} from "@/app/api/chat/agents/tools/utils/policyDetailTypes";

import { callStructuredTool, toolError } from "../adapt";
import type { McpCallContext } from "../context";
import { canUse } from "../policy";

/**
 * The retrieval tools, published to MCP clients.
 *
 * Descriptions are hand-written here rather than reused from the LangChain
 * tool instances, and that is the whole point of this module. The internal
 * descriptions carry *our* orchestration policy — "NEVER call this tool when
 * Guidelines is 'Medicare'", "CRITICAL CONFIDENTIALITY: never mention tool
 * names or file names" — which is guidance for our agent, not for a third
 * party's. Shipping it verbatim would inject our internal prompt into someone
 * else's model and describe a workflow their client is not running. Iterating
 * `createAgentTools()` would also publish `SerpAPI` (a generic web search, the
 * worst possible PHI egress) and inherit the `schema = … as any` on the
 * extractor. A static registry makes this surface a reviewed contract.
 *
 * Every description ends with the same instruction not to send patient
 * identifiers: these tools need a procedure and a diagnosis, never a person.
 */

const NO_PHI =
  " Send clinical details only — no patient names, dates of birth, member IDs or other identifiers.";

const STATE_REQUIRED =
  "Pass `state` — local coverage is defined per MAC region, and a nationwide search returns mostly noise. Ask the user which state the patient is in.";

export function registerRetrievalTools(server: McpServer, ctx: McpCallContext): void {
  const { auth } = ctx;

  if (canUse(auth, "medicare_multi_search")) {
    server.registerTool(
      "medicare_multi_search",
      {
        title: "Medicare coverage search",
        description:
          "Search Medicare coverage policy — national (NCD) and local (LCD/LCA) — in one call and return ranked matches with excerpts, CPT/ICD-10 signals and the `documentId`/`documentVersion` needed to fetch a full document. The best starting point for any Medicare coverage question." +
          NO_PHI,
        inputSchema: MedicareSearchInputSchema,
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (args) =>
        callStructuredTool({
          load: async () =>
            (await import("@/app/api/chat/agents/tools/medicareMultiSearchTool"))
              .medicareMultiSearchTool,
          args,
          ctx,
          usageType: "mcp_tool",
        }),
    );
  }

  if (canUse(auth, "ncd_coverage_search")) {
    server.registerTool(
      "ncd_coverage_search",
      {
        title: "Medicare NCD search",
        description:
          "Search National Coverage Determinations only. Use when the question is explicitly national in scope, or when `medicare_multi_search` returned local policy and you need the national rule behind it." +
          NO_PHI,
        inputSchema: MedicareSearchInputSchema,
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (args) =>
        callStructuredTool({
          load: async () => {
            const mod = await import("@/app/api/chat/agents/tools/NCDCoverageSearchTool");
            return new mod.NCDCoverageSearchTool();
          },
          args,
          ctx,
          usageType: "mcp_tool",
        }),
    );
  }

  if (canUse(auth, "local_lcd_search")) {
    server.registerTool(
      "local_lcd_search",
      {
        title: "Medicare LCD search",
        description:
          "Search Local Coverage Determinations for one U.S. state. " +
          STATE_REQUIRED +
          NO_PHI,
        inputSchema: MedicareSearchInputSchema,
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (args) => {
        if (!args.state) return toolError(STATE_REQUIRED);
        return callStructuredTool({
          load: async () =>
            (await import("@/app/api/chat/agents/tools/localLcdSearchTool")).localLcdSearchTool,
          args,
          ctx,
          usageType: "mcp_tool",
        });
      },
    );
  }

  if (canUse(auth, "local_coverage_article_search")) {
    server.registerTool(
      "local_coverage_article_search",
      {
        title: "Medicare Local Coverage Article search",
        description:
          "Search Local Coverage Articles (the billing-and-coding companions to LCDs) for one U.S. state. " +
          STATE_REQUIRED +
          NO_PHI,
        inputSchema: MedicareSearchInputSchema,
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (args) => {
        if (!args.state) return toolError(STATE_REQUIRED);
        return callStructuredTool({
          load: async () =>
            (await import("@/app/api/chat/agents/tools/localArticleSearchTool"))
              .localCoverageArticleSearchTool,
          args,
          ctx,
          usageType: "mcp_tool",
        });
      },
    );
  }

  if (canUse(auth, "medicare_policy_detail")) {
    server.registerTool(
      "medicare_policy_detail",
      {
        title: "Medicare policy detail",
        description:
          "Fetch one Medicare document in full from the CMS coverage API and return its structured detail: coverage criteria, CPT/ICD-10 code lists, documentation requirements and limitations. Take `documentType`, `documentId` and `documentVersion` from a search result — do not guess them, and do not call this twice for the same document." +
          NO_PHI,
        inputSchema: MedicarePolicyDetailInputSchema,
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (args) =>
        callStructuredTool({
          load: async () =>
            (await import("@/app/api/chat/agents/tools/medicarePolicyDetailTool"))
              .medicarePolicyDetailTool,
          args,
          ctx,
          usageType: "mcp_tool",
        }),
    );
  }

  if (canUse(auth, "commercial_guidelines_search")) {
    server.registerTool(
      "commercial_guidelines_search",
      {
        title: "Commercial payer guideline search",
        description:
          "Search NoteDoctorAi's commercial-payer prior authorization guideline corpus (cardiology, imaging, MSK/pain, oncology, genetics and more) and return ranked matches with excerpts, covered procedures and CPT/ICD-10 signals. Use this for any non-Medicare payer; use the Medicare tools for Medicare." +
          NO_PHI,
        inputSchema: CommercialGuidelineSearchInputSchema,
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (args) =>
        callStructuredTool({
          load: async () =>
            (
              await import("@/app/api/chat/agents/tools/CommercialGuidelineSearchTool")
            ).createCommercialGuidelineSearchTool(),
          args,
          ctx,
          usageType: "mcp_tool",
        }),
    );
  }

  if (canUse(auth, "policy_content_extractor")) {
    server.registerTool(
      "policy_content_extractor",
      {
        title: "Payer policy extractor",
        description:
          "Fetch up to three payer policy web pages and return structured JSON per URL: whether prior authorization is required, medical-necessity criteria, ICD-10/CPT codes, required documentation and exclusions. Only a fixed allowlist of payer domains is fetchable. For cms.gov / medicare.gov URLs use `medicare_policy_detail` instead — it is far faster and authoritative. This tool runs a language model over each page, so it is slower and billed at a higher rate than the search tools." +
          NO_PHI,
        inputSchema: PolicyContentExtractorInputSchema,
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (args) =>
        callStructuredTool({
          load: async () =>
            (await import("@/app/api/chat/agents/tools/policyContentExtractorTool"))
              .policyContentExtractorTool,
          args,
          ctx,
          // A real LLM call per URL — roughly 10x a search. Metered under its
          // own usage type so it can be priced separately without a data
          // migration.
          usageType: "mcp_extract",
        }),
    );
  }
}
