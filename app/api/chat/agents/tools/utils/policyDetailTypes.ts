/**
 * Shared shape for extracted Medicare policy details. Both
 * policyContentExtractorTool (HTML scrape + LLM) and medicarePolicyDetailTool
 * (CMS structured API) emit this exact shape so the agent's downstream
 * reasoning is identical regardless of source.
 */
export interface ExtractedPolicyDetails {
  priorAuthRequired: "YES" | "NO" | "CONDITIONAL" | "UNKNOWN";
  medicalNecessityCriteria: string[];
  icd10Codes: { code: string; description: string; context: string }[];
  cptCodes: { code: string; description: string; context: string }[];
  requiredDocumentation: string[];
  limitationsExclusions: string[];
  summary: string;
}

/**
 * Tool input schemas live here, beside the shape they produce, rather than in
 * the tool modules themselves. Both tool modules pull in real machinery at
 * import time — `@/lib/llm` for the extractor, the CMS client and cache for
 * the detail tool — so anything that needs only the *schema* (the MCP surface
 * advertising its `tools/list`, for one) must be able to get it without
 * loading any of that.
 */
import { z } from "zod";

/** `medicare_policy_detail` — one CMS document, identified exactly. */
export const MedicarePolicyDetailInputSchema = z.object({
  documentType: z.enum(["ncd", "lcd", "article"]),
  documentId: z.string().min(1),
  documentVersion: z.number().int().nonnegative(),
});

/** `policy_content_extractor` — up to three policy URLs, fetched in parallel. */
export const PolicyContentExtractorInputSchema = z.object({
  policyUrls: z
    .array(z.url())
    .min(1)
    .max(3)
    .describe(
      "One to three policy URLs to fetch in parallel. Always pass all relevant URLs in a single call.",
    ),
});
