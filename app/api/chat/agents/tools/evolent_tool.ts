import { z } from "zod";
import { StructuredTool, ToolRunnableConfig } from "@langchain/core/tools";
import { llmSummarizer } from "@/lib/llm";
import { cleanRegex } from "./utils";
import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_PRIVATE_KEY || ''; // Use service role for vector queries
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  },
});

// Initialize embeddings
const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-large",
  maxRetries: 3,
  timeout: 60000,
});

// Define schema for Carelon
const CarelonSearchInputSchema = z.object({
  query: z
    .string()
    .describe("The disease or treatment query to search for in Carelon guidelines."),
});

// Define schema for Evolent
const EvolentSearchInputSchema = z.object({
  query: z
    .string()
    .describe("The disease or treatment query to search for in Evolent guidelines."),
});

/**
 * Summarize documents using ChatGPT
 */
async function getSummaryFromDocs(content: string, query: string): Promise<string> {
  const safeContent = content.slice(0, 16000);

  const messages = [
    {
      role: "user" as const,
      content: `You are an expert Medicare Prior Authorization Assistant for healthcare providers. 
Your task is to analyze the following policy content and summarize it based on the user's query. 
The summary should be concise, factual, and directly address the query.

**User's Query:** ${query}

**Policy Content:**
${safeContent}

**Your Summary Should Include:**
1. **Prior Authorization Requirement:** State "YES," "NO," or "CONDITIONAL."
2. **Medical Necessity Criteria:** Detail the specific criteria outlined in the policy.
3. **Relevant Codes:** List associated ICD-10 and CPT/HCPCS codes.
4. **Required Documentation:** Enumerate all documentation needed for prior authorization.
5. **Limitations and Exclusions:** Note any specific limitations or exclusions mentioned in the policy.

If no relevant information is found in the policy, respond with: "No relevant information found in the provided policy content."

Ensure your response is structured clearly and concisely, following the format below:

**Summary of Policy Content:**
- **Prior Authorization Requirement:** [YES/NO/CONDITIONAL]
- **Medical Necessity Criteria:**
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

Respond only with the structured summary. Do not include any additional commentary.`,
    },
  ];

  try {
    const response = await llmSummarizer.invoke(messages);
    return response.content?.toString().trim() || "No summary generated.";
  } catch (err: any) {
    console.error("Error during ChatGPT summarization:", err);
    return `Failed to generate summary. Error: ${err.message}`;
  }
}

// --- Carelon Tool Implementation ---
export class CarelonSearchTool extends StructuredTool<typeof CarelonSearchInputSchema> {
  name = "carelon_guidelines_search";
  description =
    "Queries Carelon Guidelines vector store in Supabase and returns a summarized policy using ChatGPT.";
  schema = CarelonSearchInputSchema;

  async call<TConfig extends ToolRunnableConfig | undefined>(input: any): Promise<any> {
    try {
      const parsedInput = this.schema.parse({ query: input.query });
      return await this._call(parsedInput);
    } catch (error: any) {
      console.error("Error in CarelonSearchTool call method:", error);
      return `Error: ${error.message}`;
    }
  }

  protected async _call(
    input: z.infer<typeof CarelonSearchInputSchema>,
  ): Promise<string> {
    try {
      // Direct full-text search on Supabase table
      const { data, error } = await supabase
        .from("carelon_pdfs")
        .select("content, metadata")
        .textSearch("content", input.query, {
          type: "websearch",
          config: "english",
        })
        .limit(5); // top 5 results

      if (error) {
        console.error("Supabase search error:", error);
        throw new Error("Failed to search guidelines");
      }

      if (!data || data.length === 0) {
        return `No relevant guidelines found for the query: ${input.query}`;
      }

      // Combine and clean retrieved content
      const combinedContent = data
        .map(doc => (doc.content || "").replace(cleanRegex, "").replace(/[\r\n]+/g, " "))
        .join(" ");

      const summary = await getSummaryFromDocs(combinedContent, input.query);

      return `Found Carelon Coverage Guideline(s) for '${input.query}'. Here is a summary of the most relevant information:\n\n${summary}`;
    } catch (err: any) {
      console.error("Error in CarelonSearchTool:", err);
      return `An error occurred while searching Carelon guidelines: ${err.message}`;
    }
  }
}

// --- Evolent Tool Implementation ---
export class EvolentSearchTool extends StructuredTool<typeof EvolentSearchInputSchema> {
  name = "evolent_guidelines_search";
  description =
    "Queries Evolent Guidelines vector store in Supabase using embeddings and returns a summarized policy using ChatGPT.";
  schema = EvolentSearchInputSchema;

  async call<TConfig extends ToolRunnableConfig | undefined>(input: any): Promise<any> {
    try {
      const parsedInput = this.schema.parse({ query: input.query });
      return await this._call(parsedInput);
    } catch (error: any) {
      console.error("Error in EvolentSearchTool call method:", error);
      return `Error: ${error.message}`;
    }
  }

  protected async _call(
    input: z.infer<typeof EvolentSearchInputSchema>,
  ): Promise<string> {
    try {
      // Use SupabaseVectorStore for similarity search
      const vectorStore = await SupabaseVectorStore.fromExistingIndex(embeddings, {
        client: supabase,
        tableName: "evolent_pdfs_prod", // Replace with your embeddings table name
        queryName: "match_documents", // Replace with your query function name
      });

      // Perform similarity search
      const results = await vectorStore.similaritySearch(input.query, 10); // Top 5 results

      if (!results || results.length === 0) {
        return `No relevant guidelines found for the query: ${input.query}`;
      }

      // Combine and clean retrieved content
      const combinedContent = results
        .map(doc => (doc.pageContent || "").replace(/[\r\n]+/g, " "))
        .join(" ");

      const summary = await getSummaryFromDocs(combinedContent, input.query);

      return `Found Evolent Coverage Guideline(s) for '${input.query}'. Here is a summary of the most relevant information:\n\n${summary}`;
    } catch (err: any) {
      console.error("Error in EvolentSearchTool:", err);
      return `An error occurred while searching Evolent guidelines: ${err.message}`;
    }
  }
}
