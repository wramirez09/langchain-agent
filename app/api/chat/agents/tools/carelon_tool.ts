import { z } from "zod";
import { StructuredTool, ToolRunnableConfig } from "@langchain/core/tools";
import { createClient } from "@supabase/supabase-js";
import { llmSummarizer } from "@/lib/llm";
import { cleanRegex } from "./utils";
import { createSupabaseClient } from "@/utils/server";
import { reportUsageToStripe } from "@/lib/usage";


// --- Supabase Client (server only) ---
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// --- Input Schema ---
const CarelonSearchInputSchema = z.object({
  query: z
    .string()
    .min(3, "Query must be at least 3 characters long.")
    .describe("The disease, test, or treatment query to search for in Carelon guidelines."),
});

// --- Helper: LLM summarization of matched docs ---
async function summarizeCarelonContent(content: string, query: string): Promise<string> {
  const safeContent = content.slice(0, 16000);
  const messages = [
    {
      role: "user" as const,
      content: `You are a coverage guideline assistant working with Carelon (AIM) policies.
      Summarize the following Carelon guideline content based ONLY on the user's query.
      Be factual, concise, and do not add information that is not explicitly supported by the text.
      User's Query:
      ${query}
      Policy Content:
      ${safeContent}

Return ONLY the final summary, without any preamble or commentary.`,
    },
  ];

  try {
    const response = await llmSummarizer.invoke(messages);
    const supabase = await createSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;
    console.log("[CarelonSearchTool] User ID:", userId);
    void reportUsageToStripe({
      userId: userId!,
      usageType: "carelon_search",
      quantity: 1,
    }).catch((err) => {
      console.error("Usage report failed (non-fatal):", err);
    });
    return response.content?.toString().trim() || "No summary generated.";
  } catch (err: any) {
    console.error("[CarelonSearchTool] Error during summarization:", err);
    return "Failed to generate summary from Carelon guidelines.";
  }
}

// --- Utility: build fuzzy terms from query ---
function buildFuzzyTerms(query: string): string[] {
  const base = query.toLowerCase().trim();

  const stopwords = new Set([
    "for",
    "with",
    "without",
    "and",
    "or",
    "the",
    "this",
    "that",
    "of",
    "in",
    "on",
    "to",
    "a",
    "an",
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

// --- Main Tool ---
export class CarelonSearchTool extends StructuredTool<typeof CarelonSearchInputSchema> {
  name = "carelon_guidelines_search";
  description =
    "Searches Carelon guidelines using full-text search with a fallback fuzzy search, then summarizes or asks for clarification.";
  schema = CarelonSearchInputSchema;

  async call<TConfig extends ToolRunnableConfig | undefined>(input: any): Promise<any> {
    try {
      const parsed = this.schema.parse(input);
      return await this._call(parsed);
    } catch (err: any) {
      console.error("[CarelonSearchTool] Input validation failed:", err);
      return `Invalid input: ${err.message}`;
    }
  }

  protected async _call(input: z.infer<typeof CarelonSearchInputSchema>): Promise<string> {
    const query = input.query.trim();
    console.log("[CarelonSearchTool] Query:", query);

    try {
      // ----------------------------------------------------
      // 1) FULL-TEXT SEARCH (websearch)
      // ----------------------------------------------------
      console.log("[CarelonSearchTool] Running full-text search (websearch)...");
      const { data: ftsResults, error: ftsError } = await supabase
        .from("carelon_pdfs")
        .select("id, content, metadata")
        .textSearch("content", query, {
          type: "websearch",
          config: "english",
        })
        .limit(5);

      if (ftsError) {
        console.error("[CarelonSearchTool] Full-text search error:", ftsError);
      } else {
        console.log(
          "[CarelonSearchTool] Full-text results:",
          (ftsResults || []).map(d => ({ id: d.id, source: d.metadata?.source }))
        );
      }

      if (ftsResults && ftsResults.length > 0) {
        // Log docs used
        console.log("[CarelonSearchTool] Using FTS docs:", ftsResults.map(d => d.id));

        const combinedContent = ftsResults
          .map(d => (d.content || "").replace(cleanRegex, "").replace(/\s+/g, " "))
          .join(" ");

        const summary = await summarizeCarelonContent(combinedContent, query);

        const sourceLines = ftsResults
          .map(
            d =>
              `- **${d.metadata?.source || "Unknown source"}** (ID: ${d.id})`
          )
          .join("\n");

        return `### Carelon Coverage Summary for: "${query}"

**Policies used (Carelon docs):**
${sourceLines}

---

${summary}`;
      }

      // ----------------------------------------------------
      // 2) FUZZY ILIKE FALLBACK
      // ----------------------------------------------------
      console.log("[CarelonSearchTool] No FTS matches. Running fuzzy ILIKE search...");
      const terms = buildFuzzyTerms(query);
      console.log("[CarelonSearchTool] Fuzzy terms:", terms);

      if (terms.length === 0) {
        return `I couldn't find any Carelon guideline content matching "${query}".
          Please provide more detail, such as:
          - The specific test/procedure
          - The body region (e.g., brain, spine, abdomen, cardiac, etc.)
          - Or a CPT/HCPCS or ICD-10 code
          I'll try again with that information.`;
      }

      const orClause = terms
        .map(t => `content.ilike.%${t.replace(/%/g, "")}%`)
        .join(",");

      const { data: fuzzyResults, error: fuzzyError } = await supabase
        .from("carelon_pdfs")
        .select("id, content, metadata")
        .or(orClause)
        .limit(8);

      if (fuzzyError) {
        console.error("[CarelonSearchTool] Fuzzy search error:", fuzzyError);
      } else {
        console.log(
          "[CarelonSearchTool] Fuzzy results:",
          (fuzzyResults || []).map(d => ({ id: d.id, source: d.metadata?.source }))
        );
      }

      if (!fuzzyResults || fuzzyResults.length === 0) {
        return `I couldn't find any Carelon guidelines related to **"${query}"**.

To help locate the correct policy, please provide:
- The exact procedure/test name
- The body area (e.g., brain, spine, abdomen, pelvis, cardiac, etc.)
- Or a CPT/HCPCS or ICD-10 code.`;
      }

      // Build short previews from fuzzy matches (no summarization yet)
      const previews = fuzzyResults.slice(0, 5).map(doc => {
        const content = (doc.content || "").replace(/\s+/g, " ");
        const lower = content.toLowerCase();
        let idx = -1;

        for (const t of terms) {
          const pos = lower.indexOf(t.toLowerCase());
          if (pos !== -1) {
            idx = pos;
            break;
          }
        }

        const start = Math.max(0, idx - 80);
        const end = Math.min(content.length, idx + 160);
        const snippet =
          idx === -1
            ? content.slice(0, 220)
            : content.slice(start, end);

        return {
          id: doc.id,
          source: doc.metadata?.source || "Unknown source",
          excerpt: snippet.replace(cleanRegex, "").trim() + (snippet.length >= 220 ? "..." : ""),
        };
      });

      console.log(
        "[CarelonSearchTool] Returning fuzzy previews for docs:",
        previews.map(p => p.id)
      );

      return `### I couldn't find a clear Carelon policy exactly matching: **"${query}"**

However, these Carelon documents contain related terms:

${previews
          .map(
            p =>
              `- **${p.source}** (ID: ${p.id})  
  _Excerpt:_ “…${p.excerpt}”`
          )
          .join("\n\n")}

---

To narrow this down and pull the correct guideline, please tell me **a bit more** about what you're looking for, such as:

- The specific test/procedure name  
- The body region or clinical context  
- Or a CPT/HCPCS / ICD-10 code

With that information, I can search the Carelon policies again and provide a focused coverage summary.`;
    } catch (err: any) {
      console.error("[CarelonSearchTool] Unhandled error:", err);
      return `An error occurred while searching Carelon guidelines: ${err.message}`;
    }
  }
}
