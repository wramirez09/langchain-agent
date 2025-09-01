import { z } from "zod";
import { StructuredTool, ToolRunnableConfig } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { cleanRegex } from "./utils";

// Define schema
const CarelonSearchInputSchema = z.object({
  query: z
    .string()
    .describe(
      "The disease or treatment query to search for in Carelon guidelines.",
    ),
});

// --- Replace Gemini with ChatGPT (OpenAI) ---
const llm = new ChatOpenAI({
  model: "gpt-4o-mini", // or "gpt-4o", depending on cost vs quality
  temperature: 0,
  maxRetries: 3, // already built-in retry
});

/**
 * Summarize documents using ChatGPT
 */
async function getSummaryFromDocs(
  content: string,
  query: string,
): Promise<string> {
  // Truncate for safety — adjust per your model’s context window
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
    const response = await llm.invoke(messages);
    return response.content?.toString().trim() || "No summary generated.";
  } catch (err: any) {
    console.error("Error during ChatGPT summarization:", err);
    return `Failed to generate summary. Error: ${err.message}`;
  }
}

// --- Tool Implementation ---
export class CarelonSearchTool extends StructuredTool<
  typeof CarelonSearchInputSchema
> {
  name = "carelon_guidelines_search";
  description =
    "Queries Carelon Guidelines search API and returns a summarized policy using ChatGPT.";
  schema = CarelonSearchInputSchema;

  async call<TConfig extends ToolRunnableConfig | undefined>(
    input: any,
  ): Promise<any> {
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
    const carlonApiQuery = encodeURI(
      "https://ai-aug-carelon-hxdxaeczd9b4fdfc.canadacentral-01.azurewebsites.net/api/search?" +
        `q=${input.query}`,
    );

    try {
      const response = await fetch(carlonApiQuery, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const relevantData = await response.json();
      const body: any[] = relevantData.value;

      if (!body || body.length === 0) {
        return `No relevant guidelines found for the query: ${input.query}`;
      }

      // ✅ Optimize content cleaning: one pass instead of multiple
      const combinedContent = body
        .map((c) =>
          c.content
            .replace(/\.{25}[\s\S]*?\.{25}/g, "")
            .replace(/\\nSTATEMENT[\s\S]*?\.\{4\} 4/g, "")
            .replace(cleanRegex, "")
            .replace(/[\r\n]+/g, " "),
        )
        .join(" ");

      const summary = await getSummaryFromDocs(combinedContent, input.query);

      return `Found Carelon Coverage Guideline(s) for '${input.query}'. Here is a summary of the most relevant information:\n\n${summary}`;
    } catch (error: any) {
      console.error("Error in CarelonSearchTool:", error);
      return `An error occurred while searching Carelon guidelines: ${error.message}`;
    }
  }
}
