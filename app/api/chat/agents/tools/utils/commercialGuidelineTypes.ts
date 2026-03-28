import { z } from "zod";

/**
 * Document model for commercial guidelines loaded from local files.
 * Metadata is inferred from filename and folder structure.
 */
export interface CommercialGuidelineDoc {
  id: string;                    // generated from file path hash
  title: string;                 // inferred from filename (e.g., "mri-lumbar-spine" → "MRI Lumbar Spine")
  treatment?: string;            // inferred from filename
  domain: string;                // inferred from folder name (e.g., "plaintextcardio" → "cardio")
  sourceGroup: string;           // folder name (plaintextcardio, plaintextgenetic, etc.)
  sourceType: "commercial-guideline";
  path: string;                  // absolute file path
  fileName: string;              // just the filename
  body: string;                  // full markdown/text content
  
  // Optional fields that may be extracted from content via simple parsing:
  cptCodes?: string[];           // extracted from content if present
  icd10Codes?: string[];         // extracted from content if present
  keywords?: string[];           // extracted from filename and content
}

/**
 * Input schema for the commercial guideline search tool
 */
export const CommercialGuidelineSearchInputSchema = z.object({
  query: z
    .string()
    .min(3, "Query must be at least 3 characters long.")
    .describe("The treatment, diagnosis, or procedure query to search for in commercial guidelines."),
  treatment: z
    .string()
    .optional()
    .describe("Optional: specific treatment name to filter results."),
  diagnosis: z
    .string()
    .optional()
    .describe("Optional: diagnosis description to enhance search relevance."),
  cpt: z
    .string()
    .optional()
    .describe("Optional: CPT code to search for in guideline content."),
  icd10: z
    .string()
    .optional()
    .describe("Optional: ICD-10 code to search for in guideline content."),
  domain: z
    .string()
    .optional()
    .describe("Optional: domain/specialty filter (e.g., 'cardio', 'genetic')."),
  maxResults: z
    .number()
    .optional()
    .default(5)
    .describe("Maximum number of results to return. Default: 5."),
});

export type CommercialGuidelineSearchInput = z.infer<typeof CommercialGuidelineSearchInputSchema>;

/**
 * Helper function to infer domain from folder name
 * Examples: plaintextcardio → cardio, plaintextgenetic → genetic
 */
export function inferDomainFromFolder(folderName: string): string {
  const normalized = folderName.toLowerCase();
  
  // Remove common prefixes
  if (normalized.startsWith("plaintext")) {
    return normalized.replace("plaintext", "");
  }
  
  return normalized;
}

/**
 * Helper function to infer treatment/title from filename
 * Examples: mri-lumbar-spine.md → "MRI Lumbar Spine"
 */
export function inferTitleFromFilename(filename: string): string {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.(md|txt)$/i, "");
  
  // Split on hyphens, underscores, or camelCase
  const words = nameWithoutExt
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/\s+/);
  
  // Capitalize each word
  return words
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Helper function to extract CPT codes from content
 * Matches patterns like: CPT 12345, CPT: 12345, CPT-12345, or standalone 5-digit codes
 */
export function extractCPTCodes(content: string): string[] {
  const cptPattern = /\b(?:CPT[:\s-]?)?(\d{5})\b/gi;
  const matches = content.match(cptPattern);
  
  if (!matches) return [];
  
  // Extract just the 5-digit codes and deduplicate
  const codes = matches.map(match => {
    const digits = match.match(/\d{5}/);
    return digits ? digits[0] : null;
  }).filter(Boolean) as string[];
  
  return [...new Set(codes)];
}

/**
 * Helper function to extract ICD-10 codes from content
 * Matches patterns like: ICD-10: M54.16, M54.16, or similar alphanumeric codes
 */
export function extractICD10Codes(content: string): string[] {
  const icd10Pattern = /\b(?:ICD-?10[:\s-]?)?([A-Z]\d{2}(?:\.\d{1,2})?)\b/gi;
  const matches = content.match(icd10Pattern);
  
  if (!matches) return [];
  
  // Extract just the codes and deduplicate
  const codes = matches.map(match => {
    const code = match.match(/[A-Z]\d{2}(?:\.\d{1,2})?/i);
    return code ? code[0].toUpperCase() : null;
  }).filter(Boolean) as string[];
  
  return [...new Set(codes)];
}

/**
 * Helper function to extract keywords from filename
 */
export function extractKeywordsFromFilename(filename: string): string[] {
  const nameWithoutExt = filename.replace(/\.(md|txt)$/i, "");
  
  // Split on hyphens, underscores, or camelCase
  const words = nameWithoutExt
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2); // Filter out very short words
  
  return [...new Set(words)];
}
