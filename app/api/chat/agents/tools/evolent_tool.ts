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
      content: `You are an expert medical policy summarizer. 
Analyze the following Evolent coverage policy text and summarize relevant information strictly based on the user query. 

**Query:** ${query}

**Policy Text:**
${safeContent}

Respond only in the following structured format:

**Summary of Policy Content:**
- **Prior Authorization Requirement:** [YES/NO/CONDITIONAL]
- **Medical Necessity Criteria:**
  * [Criterion 1]
  * [Criterion 2]
- **Relevant Codes:**
  * **ICD-10:** [Codes]
  * **CPT/HCPCS:** [Codes]
- **Required Documentation:**
  * [Docs]
- **Limitations/Exclusions:**
  * [Limitations]

If no relevant data is found, respond: "No relevant information found."`,
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
