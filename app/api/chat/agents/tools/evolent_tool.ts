import { z } from "zod";
import { StructuredTool, ToolRunnableConfig } from "@langchain/core/tools";
import { llmSummarizer } from "@/lib/llm";
import { cleanRegex } from "./utils";
import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";

// --- Supabase Client ---
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_PRIVATE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// --- Embeddings ---
const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-large",
  maxRetries: 3,
  timeout: 60000,
  dimensions: 3072, // Ensures full use of model capability
});

// --- Input Schema ---
const EvolentSearchInputSchema = z.object({
  query: z
    .string()
    .describe("The disease, treatment, or prior auth query to search for in Evolent guidelines."),
});

// --- Helper: Summarize retrieved docs ---
async function getSummaryFromDocs(content: string, query: string): Promise<string> {
  const safeContent = content.slice(0, 18000);

  const messages = [
    {
      role: "user" as const,
      content: `You are an expert Medicare Prior Authorization Assistant for healthcare providers. 
Your task is to thoroughly analyze the following policy content and extract **all** relevant and related information that matches the user’s query.
Your goal is to produce a complete, factual, and well-structured summary — ensuring that no related data point is omitted, even if it appears in different sections or tables of the policy.

**User's Query:** ${query}

**Policy Content:**
${safeContent}

**Your Summary Must Include:**
1. **Prior Authorization Requirement:** Clearly state "YES," "NO," or "CONDITIONAL," and explain any conditions or exceptions that apply.
2. **Medical Necessity Criteria:** List every specific requirement or clinical criterion bulleted in the policy, including thresholds, indications, and contraindications.
3. **Relevant Codes:** Extract all associated ICD-10, CPT, and/or HCPCS codes mentioned anywhere in the document.
4. **Required Documentation:** Identify every form, report, test result, or other documentation explicitly or implicitly required for prior authorization.
5. **Limitations and Exclusions:** Include all policy limitations, frequency restrictions, age limits, site-of-service restrictions, or excluded indications.
6. **Additional Related Data Points:** Capture any referenced notes, footnotes, tables, or cross-references (e.g., “see related policy,” “refer to guideline,” etc.) that provide context or conditions related to the above categories.

If no relevant information is found, respond with: 
> "No relevant information found in the provided policy content."

**Output Format (use this exact structure):**

**Summary of Policy Content:**
- **Prior Authorization Requirement:** [YES/NO/CONDITIONAL]
- **Medical Necessity Criteria and or Guidelines:**
  * [Criterion 1]
  * [Criterion 2]
  * (etc.)
- **Relevant Codes:**
  * **ICD-10:** [List of ICD-10 codes]
  * **CPT/HCPCS:** [List of CPT/HCPCS codes]
- **Required Documentation:**
  * [Documentation Item 1]
  * [Documentation Item 2]
  * (etc.)
- **Limitations/Exclusions:**
  * [Limitation/Exclusion 1]
  * [Limitation/Exclusion 2]
  * (etc.)
- **Additional Related Data Points:**
  * [Data Point 1]
  * [Data Point 2]
  * (etc.)

Respond **only** with the structured summary. Do not include any commentary or explanations outside the specified format.`,
    },
  ];


  try {
    const response = await llmSummarizer.invoke(messages);
    return response.content?.toString().trim() || "No summary generated.";
  } catch (err: any) {
    console.error("Error summarizing policy:", err);
    return `Failed to summarize policy. Error: ${err.message}`;
  }
}

// --- Main Tool ---
export class EvolentSearchTool extends StructuredTool<typeof EvolentSearchInputSchema> {
  name = "evolent_guidelines_search";
  description =
    "Searches the Evolent Guidelines vector database using semantic embeddings and returns a summarized policy response.";
  schema = EvolentSearchInputSchema;

  async call<TConfig extends ToolRunnableConfig | undefined>(input: any): Promise<any> {
    try {
      const parsed = this.schema.parse(input);
      return await this._call(parsed);
    } catch (err: any) {
      console.error("Input validation failed:", err);
      return `Invalid input: ${err.message}`;
    }
  }

  protected async _call(input: z.infer<typeof EvolentSearchInputSchema>): Promise<string> {
    try {
      // --- Create vector store ---
      const vectorStore = await SupabaseVectorStore.fromExistingIndex(embeddings, {
        client: supabase,
        tableName: "evolent_pdfs_prod",
        queryName: "match_documents",
      });

      // --- Perform semantic search ---
      const rawResults = await vectorStore.similaritySearchWithScore(input.query, 12);

      if (!rawResults || rawResults.length === 0)
        return `No relevant guidelines found for "${input.query}".`;

      // --- Filter by similarity threshold ---
      const filtered = rawResults.filter(([_, score]) => score > 0.75);
      const topDocs = filtered.length > 0 ? filtered : rawResults.slice(0, 5);

      // --- Combine and clean content ---
      const combinedContent = topDocs
        .map(([doc]) => (doc.pageContent || "").replace(cleanRegex, "").replace(/\s+/g, " "))
        .join(" ")
        .slice(0, 18000);

      // --- Summarize final results ---
      const summary = await getSummaryFromDocs(combinedContent, input.query);

      return `✅ **Evolent Policy Summary for:** "${input.query}"\n\n${summary}`;
    } catch (err: any) {
      console.error("EvolentSearchTool failed:", err);
      return `An error occurred while querying Evolent policies: ${err.message}`;
    }
  }
}
