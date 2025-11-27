import { z } from "zod";
import { StructuredTool, ToolRunnableConfig } from "@langchain/core/tools";
import { createClient } from "@supabase/supabase-js";
import { llmSummarizer } from "@/lib/llm";
import { cleanRegex } from "./utils";

// --- Supabase client (service role) ---
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// --- Input schema ---
const EvolentSearchInputSchema = z.object({
  query: z
    .string()
    .min(3, "Query must be at least 3 characters long.")
    .describe("The user’s query for searching Evolent guidelines."),
});

// --- Summarization helper ---
async function summarizeEvolentContent(content: string, query: string): Promise<string> {
  const safeContent = content.slice(0, 16000);

  const messages = [
    {
      role: "user" as const,
      content: `You are a coverage guideline assistant working with Evolent policies.

Summarize the following content based ONLY on the user's query.
Be factual, concise, and do not add information that is not explicitly supported by the text.

User's Query:
${query}

Policy Content:
${safeContent}

Return ONLY the summary (no intro, no commentary).`,
    },
  ];


  try {
    const response = await llmSummarizer.invoke(messages);
    return response.content?.toString().trim() || "No summary generated.";
  } catch (err: any) {
    console.error("[EvolentSearchTool] Summarization error:", err);
    return "Failed to summarize Evolent guidelines.";
  }
}

// --- Build fuzzy terms ---
function buildFuzzyTerms(query: string): string[] {
  const base = query.toLowerCase().trim();

  const stopwords = new Set([
    "for", "with", "without", "and", "or", "the", "this", "that", "of", "in", "on", "to", "a", "an"
  ]);

  // Sanitize the base query by removing special characters that break Supabase syntax
  const sanitizedBase = base.replace(/[()\[\]{}",']/g, "").replace(/\s+/g, " ").trim();

  const tokens = sanitizedBase
    .split(/\s+/)
    .map(t => t.replace(/[^a-z0-9\-]/gi, ""))
    .filter(t => t.length > 3 && !stopwords.has(t));

  const terms = new Set<string>();
  if (sanitizedBase.length > 3) terms.add(sanitizedBase);
  tokens.forEach(t => terms.add(t));

  return Array.from(terms);
}

// --- Main Tool (1:1 match with Carelon tool style) ---
export class EvolentSearchTool extends StructuredTool<typeof EvolentSearchInputSchema> {
  name = "evolent_guidelines_search";
  description = "Search Evolent guidelines using full-text and fuzzy matching.";
  schema = EvolentSearchInputSchema;

  async call<TConfig extends ToolRunnableConfig | undefined>(input: any) {
    try {
      const parsed = this.schema.parse(input);
      return await this._call(parsed);
    } catch (err: any) {
      console.error("[EvolentSearchTool] Input validation failed:", err);
      return `Invalid input: ${err.message}`;
    }
  }

  protected async _call(input: z.infer<typeof EvolentSearchInputSchema>) {
    const query = input.query.trim();
    console.log("[EvolentSearchTool] Query:", query);

    try {
      // ----------------------------------------------------------
      // 1) FULL-TEXT SEARCH
      // ----------------------------------------------------------
      console.log("[EvolentSearchTool] Running full-text search...");
      const { data: ftsResults, error: ftsError } = await supabase
        .from("evolent_pdfs_prod")
        .select("id, content, metadata")
        .textSearch("content", query, {
          type: "websearch",
          config: "english",
        })
        .limit(5);

      if (ftsError) console.error("[EvolentSearchTool] FTS error:", ftsError);

      if (ftsResults && ftsResults.length > 0) {
        console.log("[EvolentSearchTool] FTS matches:", ftsResults.map(r => r.id));

        const combinedContent = ftsResults
          .map(d => (d.content || "").replace(cleanRegex, "").replace(/\s+/g, " "))
          .join(" ");

        const summary = await summarizeEvolentContent(combinedContent, query);

        const sourceList = ftsResults
          .map(d => `- **${d.metadata?.source || "Unknown source"}**`)
          .join("\n");

        return `### Evolent Coverage Summary for: "${query}"

      **Documents used:**
      ${sourceList}

      ---

      ${summary}`;
      }

      // ----------------------------------------------------------
      // 2) FUZZY FALLBACK (ILIKE)
      // ----------------------------------------------------------
      console.log("[EvolentSearchTool] No FTS matches → Running fuzzy fallback...");
      const terms = buildFuzzyTerms(query);
      console.log("[EvolentSearchTool] Fuzzy terms:", terms);

      if (terms.length === 0) {
        return `I could not find any Evolent policies matching "${query}".  
Please include more context such as the procedure name or codes.`;
      }

      const orClause = terms.map(t => `content.ilike.%${t}%`).join(",");

      const { data: fuzzyResults, error: fuzzyError } = await supabase
        .from("evolent_pdfs_prod")
        .select("id, content, metadata")
        .or(orClause)
        .limit(8);

      if (fuzzyError) console.error("[EvolentSearchTool] Fuzzy error:", fuzzyError);

      if (!fuzzyResults || fuzzyResults.length === 0) {
        return `No Evolent guidelines found related to **"${query}"**.

Please include details such as:
- Procedure/test name  
- Body region  
- CPT/HCPCS/ICD-10 codes  
`;
      }

      const previews = fuzzyResults.slice(0, 5).map(d => {
        const text = (d.content || "").replace(/\s+/g, " ");
        const snippet = text.slice(0, 220);

        return `- **${d.metadata?.source || "Unknown source"}** (ID: ${d.id})  
  _Excerpt:_ “…${snippet}…”`;
      });

      return `### No exact Evolent match for: **"${query}"**

Here are related documents:

${previews.join("\n\n")}

---

To refine results, please include:
- Procedure/test name  
- Body region  
- Or CPT/HCPCS/ICD-10 codes`;
    } catch (err: any) {
      console.error("[EvolentSearchTool] Unexpected error:", err);
      return `An error occurred while searching Evolent guidelines: ${err.message}`;
    }
  }
}
