import { StructuredTool } from "@langchain/core/tools";
import { loadRelevantDocuments, getMetadataIndex } from "./utils/commercialGuidelineLoaderOptimized";
import { scoreAndRankDocuments } from "./utils/scoreCommercialGuideline";
import {
  CommercialGuidelineSearchInputSchema,
  CommercialGuidelineSearchInput,
  CommercialGuidelineSearchOutput,
} from "./utils/commercialGuidelineTypes";
import { llmSummarizer } from "@/lib/llm";

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
 * - Automatic merging of overlapping documents (same CPT/ICD-10 codes or similar treatments)
 * - Domain and metadata filtering
 * - Fast, cached document loading
 * - Structured input/output
 * 
 * Architecture:
 * - Load full documents (no chunking)
 * - Score using weighted signals (CPT, ICD-10, keywords, fuzzy matching)
 * - Detect and merge overlapping documents for comprehensive results
 * - Return top matches + related matches
 * - LLM synthesizes final answer from structured results
 */
export class CommercialGuidelineSearchTool extends StructuredTool<typeof CommercialGuidelineSearchInputSchema> {
  name = "commercial_guidelines_search";
  
  description = `Search commercial guidelines for prior authorization requirements using structured inputs.

This tool performs deterministic search across commercial guideline documents to find relevant authorization criteria with enhanced metadata matching.

**When to use:**
- User asks about commercial insurance authorization requirements
- Query mentions treatments, procedures, or diagnoses
- Need to find coverage criteria for commercial payers

**How it works:**
- Exact matching on CPT and ICD-10 codes (+10 points each, highest priority)
- Procedure name matching (+8 points per match)
- Alias/alternative name matching (+6 points per match)
- Specialty matching (+5 points per match)
- Related condition matching (+4 points per match)
- Payer-specific notes matching (+3 points)
- Priority document boosting (+1-2 points)
- Keyword overlap scoring for treatment and diagnosis
- Domain filtering (cardio, genetic, musculoskeletal, etc.)
- Automatically merges overlapping documents (same CPT/ICD-10 or >70% treatment similarity)
- Merged documents receive bonus scoring (+2 per additional source)
- Returns ranked results with match explanations
- **Automatically summarizes large results (>30K chars) to prevent token overflow**

**Input fields:**
- query: Main search query (required)
- treatment: Specific treatment name (optional, e.g., "MRI lumbar spine")
- diagnosis: Diagnosis description (optional)
- cpt: CPT/HCPCS  for exact matching (optional, e.g., "72148")
- icd10: ICD-10 code(s) for exact matching (optional, e.g., "M54.16")
- domain: Domain filter (optional, e.g., "cardio", "genetic", "muscle")
- payer: Payer name (optional, e.g., "commercial", "medicare")
- maxResults: Number of results (optional, default: 5)

**Output:**
Returns structured JSON with topMatches and relatedMatches, each containing:
- title, score, domain, matchedOn (signals), excerpt, cptCodes, icd10Codes
If results are large, returns a summarized version with key authorization requirements.

**CRITICAL CONFIDENTIALITY:**
Never mention specific data sources, tool names, URLs, file names, folder names, or document references in your response.
Use ONLY generic terms like "commercial guidelines", "proprietary criteria", or "industry standards".`;

  schema = CommercialGuidelineSearchInputSchema;

  async _call(input: CommercialGuidelineSearchInput): Promise<string> {
    console.log("[CommercialGuidelineSearchTool] Received input:", input);
    
    try {
      // Load only relevant documents based on metadata filtering
      // This is much faster than loading all 58 documents
      const docs = loadRelevantDocuments(input);
      
      if (docs.length === 0) {
        return JSON.stringify({
          query: input.query,
          topMatches: [],
          relatedMatches: [],
          error: "No matching commercial guideline documents found for the query criteria.",
        });
      }
      
      console.log(`[CommercialGuidelineSearchTool] Searching ${docs.length} relevant documents`);
      
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
      const jsonOutput = JSON.stringify(output, null, 2);
      
      // If output is too large (>30K chars ≈ 7.5K tokens), summarize it
      if (jsonOutput.length > 30000) {
        console.warn(`[CommercialGuidelineSearchTool] Large output detected: ${jsonOutput.length} chars (≈${Math.round(jsonOutput.length / 4)} tokens). Summarizing...`);
        
        try {
          const summarizationPrompt = `You are analyzing commercial guideline search results for a prior authorization request.

Query: ${input.query}
${input.treatment ? `Treatment: ${input.treatment}` : ''}
${input.diagnosis ? `Diagnosis: ${input.diagnosis}` : ''}
${input.cpt ? `CPT Code: ${input.cpt}` : ''}
${input.icd10 ? `ICD-10 Code: ${input.icd10}` : ''}

Search Results:
${jsonOutput}

Please provide a concise summary of the key authorization requirements, focusing on:
1. Medical necessity criteria
2. Required documentation
3. Coverage limitations or exclusions
4. Relevant CPT/ICD-10 codes
5. Any special conditions or requirements

Keep the summary under 2000 words while preserving all critical authorization details.`;

          const summaryResponse = await llmSummarizer().invoke([
            { role: "user", content: summarizationPrompt }
          ]);
          
          const summary = summaryResponse.content?.toString() ?? "";
          console.log(`[CommercialGuidelineSearchTool] Summarized output: ${summary.length} chars (≈${Math.round(summary.length / 4)} tokens)`);
          
          return JSON.stringify({
            query: input.query,
            summarized: true,
            summary,
            matchCount: {
              topMatches: topMatches.length,
              relatedMatches: relatedMatches.length
            },
            topMatchTitles: topMatches.map(m => m.title),
          }, null, 2);
        } catch (summarizationError) {
          console.error(`[CommercialGuidelineSearchTool] Summarization failed:`, summarizationError);
          // Fall back to truncated output
          console.warn(`[CommercialGuidelineSearchTool] Falling back to truncated output`);
          return jsonOutput.substring(0, 30000) + '\n\n... [Output truncated due to size]';
        }
      }
      
      return jsonOutput;
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
 * Pre-load metadata index at module initialization time (singleton pattern)
 * This is very fast (~0.02-0.05s) and only loads YAML front matter, not full content
 * Full documents are loaded on-demand based on query criteria
 */
const metadataIndex = getMetadataIndex();
console.log(`[CommercialGuidelineSearchTool] Metadata index loaded at module initialization: ${metadataIndex.length} documents`);

/**
 * Factory function to create the tool instance
 * Metadata is already indexed at module scope, so this returns immediately
 */
export function createCommercialGuidelineSearchTool(): CommercialGuidelineSearchTool {
  return new CommercialGuidelineSearchTool();
}
