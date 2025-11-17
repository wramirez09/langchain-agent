import { z } from "zod";
import { StructuredTool, ToolRunnableConfig } from "@langchain/core/tools";
import { llmSummarizer } from "@/lib/llm";
import { cleanRegex } from "./utils";
import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";

// --- Supabase Client (server-side; service role only) ---
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseKey) {
  console.warn("⚠️ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// --- Embeddings ---
const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-large",
  // dimensions: 3072, // optional; model is fixed-dim anyway
});

// --- Input Schema ---
const EvolentSearchInputSchema = z.object({
  query: z
    .string()
    .describe("The disease, treatment, or prior auth query to search for in Evolent guidelines."),
});

// --- Helper: Structured Summary Extraction ---
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
7. **Related Policies:** List the names/IDs of any related or referenced policies (e.g., “See related policy: Abdominal Imaging Guidelines”), if present.

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
- **Related Policies:**
  * [Policy Name or ID 1]
  * [Policy Name or ID 2]
  * (etc.)

Respond **only** with the structured summary in markdown using this exact format.`,
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
    "Searches the Evolent Guidelines vector database using weighted hybrid (semantic + keyword) search and returns a structured prior-auth summary plus related policies.";
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
    const query = input.query;
    console.log("EvolentSearchTool query:", query);

    try {
      // --- Create vector store ---
      const vectorStore = await SupabaseVectorStore.fromExistingIndex(embeddings, {
        client: supabase,
        tableName: "evolent_pdfs_prod",
        queryName: "match_documents",
      });

      console.log("VectorStore created");

      // --- Simple connectivity smoke test ---
      const { data: tableTest, error: tableError } = await supabase
        .from("evolent_pdfs_prod")
        .select("id")
        .limit(1);

      console.log("Table smoke test:", { tableTest, tableError });

      // ----------------------------------------------------------
      // 🩺 1) DETECT IF QUERY IS CODE-HEAVY (CPT / ICD / HCPCS)
      // ----------------------------------------------------------
      const hasCPT = /\b\d{4,5}\b/.test(query); // rough heuristic
      const hasICD10 = /[A-TV-Z]\d{2}(\.\d+)?/.test(query);
      const hasHCPCS = /^[A-Z]\d{4}$/i.test(query);

      const keywordHeavy = hasCPT || hasICD10 || hasHCPCS;

      const vectorWeight = keywordHeavy ? 0.4 : 0.7;
      const keywordWeight = keywordHeavy ? 0.6 : 0.3;

      console.log("Weights:", { vectorWeight, keywordWeight, keywordHeavy });

      // ----------------------------------------------------------
      // 🔍 2) SEMANTIC VECTOR SEARCH
      // ----------------------------------------------------------
      const vectorResults = await vectorStore.similaritySearchWithScore(query, 12);
      const vectorDocs = vectorResults.map(([doc, distance]) => ({
        id: doc.id as string | undefined,
        text: doc.pageContent,
        source: "vector" as const,
        vectorScore: 1 - distance,
        keywordScore: 0,
      }));

      console.log("Vector results count:", vectorDocs.length);

      // ----------------------------------------------------------
      // 🔍 3) FULL-TEXT KEYWORD SEARCH
      // ----------------------------------------------------------
      const { data: keywordRows, error: keywordErr } = await supabase
        .from("evolent_pdfs_prod")
        .select("id, content")
        .textSearch("content", query, { type: "websearch" })
        .limit(12);

      if (keywordErr) {
        console.error("Keyword search error:", keywordErr);
      }

      const keywordDocs =
        keywordRows?.map((row) => ({
          id: row.id as string | undefined,
          text: row.content,
          source: "keyword" as const,
          vectorScore: 0,
          keywordScore: 0.85, // baseline relevance for keyword hits
        })) ?? [];

      console.log("Keyword results count:", keywordDocs.length);

      // ----------------------------------------------------------
      // 🔀 4) MERGE, DEDUPE, WEIGHTED SCORE
      // ----------------------------------------------------------
      const merged = [...vectorDocs, ...keywordDocs];

      const dedupeMap = new Map<string, (typeof merged)[number]>();

      merged.forEach((doc) => {
        const key = doc.id ?? `${doc.source}-${doc.text?.slice(0, 50)}`;
        const existing = dedupeMap.get(key);
        if (!existing) {
          dedupeMap.set(key, doc);
        } else {
          // merge scores if same doc appears from both sources
          existing.vectorScore = Math.max(existing.vectorScore, doc.vectorScore);
          existing.keywordScore = Math.max(existing.keywordScore, doc.keywordScore);
        }
      });

      const deduped = Array.from(dedupeMap.values());

      const ranked = deduped
        .map((doc) => ({
          ...doc,
          finalScore: doc.vectorScore * vectorWeight + doc.keywordScore * keywordWeight,
        }))
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, 5);

      console.log("Ranked docs:", ranked.length);

      if (ranked.length === 0) {
        return `No relevant guidelines found for "${query}".`;
      }

      // ----------------------------------------------------------
      // 📄 5) COMBINE CONTENT FOR LLM SUMMARY
      // ----------------------------------------------------------
      const combinedContent = ranked
        .map((d) =>
          (d.text || "")
            .replace(cleanRegex, "")
            .replace(/\s+/g, " ")
        )
        .join(" ")
        .slice(0, 18000);

      // ----------------------------------------------------------
      // 🧠 6) STRUCTURED SUMMARY + RELATED POLICIES (LLM)
      // ----------------------------------------------------------
      const summary = await getSummaryFromDocs(combinedContent, query);

      return `🔍 **Evolent Hybrid Policy Summary for:** "${query}"\n\n${summary}`;
    } catch (err: any) {
      console.error("EvolentSearchTool failed:", err);
      return `An error occurred while querying Evolent policies: ${err.message}`;
    }
  }
}
