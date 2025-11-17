import { z } from "zod";
import { StructuredTool, ToolRunnableConfig } from "@langchain/core/tools";
import { llmSummarizer } from "@/lib/llm";
import { cleanRegex } from "./utils";
import { createClient } from "@supabase/supabase-js";
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
  model: "text-embedding-3-small",
  maxRetries: 3,
  timeout: 60000,
});

// Define schema
const CarelonSearchInputSchema = z.object({
  query: z
    .string()
    .describe("The disease or treatment query to search for in Carelon guidelines."),
});

/**
 * Summarize documents using ChatGPT
 */
async function getSummaryFromDocs(content: string, query: string): Promise<string> {
  const safeContent = content.slice(0, 16000);

  const messages = [
    {
      role: "user" as const,
      content: `Summarize the following Carelon guideline content based on the user's query.
The summary should be concise, factual, and directly address the query.

User's Query: ${query}

Document Content:
${safeContent}`,
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

// --- Tool Implementation ---
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
