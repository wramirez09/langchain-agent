import { StructuredTool } from "@langchain/core/tools";
import { loadCommercialGuidelines } from "./utils/commercialGuidelineLoader";
import { scoreAndRankDocuments } from "./utils/scoreCommercialGuideline";
import {
  CommercialGuidelineSearchInputSchema,
  CommercialGuidelineSearchInput,
  CommercialGuidelineSearchOutput,
} from "./utils/commercialGuidelineTypes";

/**
 * Commercial Guideline Search Tool
 * 
 * A structured tool that uses deterministic scoring to search commercial guidelines
 * for prior authorization requirements.
 * 
 * Features:
 * - Deterministic weighted scoring (no embeddings, no LLM calls)
 * - Exact CPT/ICD-10 code matching (+10 points each)
 * - Treatment/diagnosis keyword overlap scoring
 * - Domain and metadata filtering
 * - Fast, cached document loading
 * - Structured input/output
 * 
 * Architecture:
 * - Load full documents (no chunking)
 * - Score using weighted signals (CPT, ICD-10, keywords, fuzzy matching)
 * - Return top matches + related matches
 * - LLM synthesizes final answer from structured results
 */
export class CommercialGuidelineSearchTool extends StructuredTool<typeof CommercialGuidelineSearchInputSchema> {
  name = "commercial_guidelines_search";
  
  description = `Search commercial guidelines for prior authorization requirements using structured inputs.

This tool performs deterministic search across commercial guideline documents to find relevant authorization criteria.

**When to use:**
- User asks about commercial insurance authorization requirements
- Query mentions treatments, procedures, or diagnoses
- Need to find coverage criteria for commercial payers

**How it works:**
- Exact matching on CPT and ICD-10 codes (highest priority)
- Keyword overlap scoring for treatment and diagnosis
- Domain filtering (cardio, genetic, etc.)
- Returns ranked results with match explanations

**Input fields:**
- query: Main search query (required)
- treatment: Specific treatment name (optional, e.g., "MRI lumbar spine")
- diagnosis: Diagnosis description (optional)
- cpt: CPT code(s) for exact matching (optional, e.g., "72148")
- icd10: ICD-10 code(s) for exact matching (optional, e.g., "M54.16")
- domain: Domain filter (optional, e.g., "cardio", "genetic")
- state: Patient state (optional)
- payer: Payer name (optional)
- maxResults: Number of results (optional, default: 5)

**Output:**
Returns structured JSON with topMatches and relatedMatches, each containing:
- title, score, domain, matchedOn (signals), excerpt

**CRITICAL CONFIDENTIALITY:**
Never mention specific data sources, tool names, URLs, file names, folder names, or document references in your response.
Use ONLY generic terms like "commercial guidelines", "proprietary criteria", or "industry standards".`;

  schema = CommercialGuidelineSearchInputSchema;

  async _call(input: CommercialGuidelineSearchInput): Promise<string> {
    console.log("[CommercialGuidelineSearchTool] Received input:", input);
    
    try {
      // Load documents (cached after first load)
      const docs = await loadCommercialGuidelines();
      
      if (docs.length === 0) {
        return JSON.stringify({
          query: input.query,
          topMatches: [],
          relatedMatches: [],
          error: "No commercial guideline documents found in the system.",
        });
      }
      
      console.log(`[CommercialGuidelineSearchTool] Searching ${docs.length} documents`);
      
      // Score and rank documents using deterministic scoring
      const { topMatches, relatedMatches } = scoreAndRankDocuments(docs, input);
      
      // Build structured output
      const output: CommercialGuidelineSearchOutput = {
        query: input.query,
        topMatches,
        relatedMatches,
      };
      
      console.log(`[CommercialGuidelineSearchTool] Found ${topMatches.length} top matches, ${relatedMatches.length} related matches`);
      
      // Return as JSON string for LLM to parse
      return JSON.stringify(output, null, 2);
    } catch (error) {
      console.error("[CommercialGuidelineSearchTool] Error during search:", error);
      return JSON.stringify({
        query: input.query,
        topMatches: [],
        relatedMatches: [],
        error: error instanceof Error ? error.message : "Unknown error occurred during search",
      });
    }
  }
}

/**
 * Factory function to create the tool instance
 * Maintains compatibility with existing code that uses createCommercialGuidelineSearchTool()
 */
export async function createCommercialGuidelineSearchTool(): Promise<CommercialGuidelineSearchTool> {
  // Pre-load documents to warm the cache
  console.log("[CommercialGuidelineSearchTool] Pre-loading documents...");
  await loadCommercialGuidelines();
  
  return new CommercialGuidelineSearchTool();
}
