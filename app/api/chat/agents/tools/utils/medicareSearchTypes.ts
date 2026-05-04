import { z } from "zod";

/**
 * Shared input schema for all Medicare search tools (NCD, LCD, LCA)
 * Provides consistent interface across Medicare workflow
 */
export const MedicareSearchInputSchema = z.object({
  query: z
    .string()
    .min(1, "Query must not be empty.")
    .describe("The main search query describing the treatment, diagnosis, or NCD/LCD number."),
  treatment: z
    .string()
    .optional()
    .describe("Optional: specific treatment name (e.g., 'MRI lumbar spine')."),
  diagnosis: z
    .string()
    .optional()
    .describe("Optional: diagnosis description to enhance search relevance."),
  cpt: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe("Optional: CPT/HCPCS  to match (e.g., '72148' or ['72148', '72149'])."),
  icd10: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe("Optional: ICD-10 code(s) to match (e.g., 'M54.16' or ['M54.16', 'M54.17'])."),
  state: z
    .string()
    .optional()
    .describe("Optional: U.S. state for LCD/LCA filtering (e.g., 'Illinois', 'California')."),
  maxResults: z
    .number()
    .optional()
    .default(10)
    .describe("Maximum number of top results to return. Default: 10."),
});

export type MedicareSearchInput = z.infer<typeof MedicareSearchInputSchema>;

/**
 * Scored result for a Medicare document (NCD, LCD, or LCA)
 */
export interface MedicareScoredResult {
  id: string;
  title: string;
  displayId?: string;
  // documentId/documentVersion are exposed as top-level fields so the agent
  // can call medicare_policy_detail without parsing the combined `id`.
  documentId?: string;
  documentVersion?: number;
  score: number;
  url?: string;
  matchedOn: string[];
  excerpt?: string;
  metadata?: {
    status?: string;
    lastUpdated?: string;
    effectiveDate?: string;
    retirementDate?: string;
    contractor?: string;
    documentType?: string;
  };
}

/**
 * Standard output format for Medicare search tools
 */
export interface MedicareSearchOutput {
  query: MedicareSearchInput;
  topMatches: MedicareScoredResult[];
  relatedMatches?: MedicareScoredResult[];
}

/**
 * Normalize CPT/ICD codes to arrays for consistent processing
 */
export function normalizeCodes(codes?: string | string[]): string[] {
  if (!codes) return [];
  return Array.isArray(codes) ? codes : [codes];
}

/**
 * Helper to normalize input for consistent processing
 */
export function normalizeInput(input: MedicareSearchInput): {
  query: string;
  treatment?: string;
  diagnosis?: string;
  cptCodes: string[];
  icd10Codes: string[];
  state?: string;
  maxResults: number;
} {
  return {
    query: input.query,
    treatment: input.treatment,
    diagnosis: input.diagnosis,
    cptCodes: normalizeCodes(input.cpt),
    icd10Codes: normalizeCodes(input.icd10),
    state: input.state,
    maxResults: input.maxResults || 10,
  };
}
