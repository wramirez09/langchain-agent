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
