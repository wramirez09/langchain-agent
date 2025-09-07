import { z } from "zod";
import { StructuredTool, ToolRunnableConfig } from "@langchain/core/tools";
import { llmSummarizer } from "@/lib/llm";
import { cleanRegex } from "./utils"; // Assume external cleaning regex utility

// Input schema
const EvolentSearchInputSchema = z.object({
  query: z
    .string()
    .describe(
      "The disease or treatment query to search for in Evolent guidelines.",
    ),
});


export class EvolentSearchTool extends StructuredTool<
  typeof EvolentSearchInputSchema
> {
  name = "evolent_guidelines_search";
  description =
    "Searches Evolent Guidelines and provides a fast summarized policy.";
  schema = EvolentSearchInputSchema;

  async call<TConfig extends ToolRunnableConfig | undefined>(
    input: any,
  ): Promise<any> {
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
    const evolentApiQuery = encodeURI(
      "https://ai-aug-carelon-hxdxaeczd9b4fdfc.canadacentral-01.azurewebsites.net/api/evolent/search?" +
        `q=${input.query}`,
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    
    try {
      const response = await fetch(evolentApiQuery, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
      
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const relevantData = await response.json();
      const firstResult = relevantData?.value?.[0];

      if (!firstResult || !firstResult.content) {
        return `No Evolent data found for '${input.query}'.`;
      }

      // ⚡ Combined cleaning regex (single pass)
      const cleanedContent = firstResult.content
        .replace(
          /auer BG, Long MD\. ACG Clinical Guideline: UlcerativeColitis in Adults\.[\s\S]*?DISCLAIMER\s*\.{5}\s*\d+|\.{25}[\s\S]*?\.{25}|\s*Page \d+ of \d+ Evolent Clinical Guideline[\s\S]*?Implementation Date: \w+ \d+\.\.\. \d+[\s\S]*?DISCLAIMER\s*\.{5}\s*\d+|\\nSTATEMENT[\s\S]*?\.\{4\} 4|TABLE OF CONTENTS STATEMENT[\s\S]*?CODING \.\. 2|[A-Z\s]+\.{9}[\s\S]*?[A-Z\s]+\.{9}/g,
          "",
        )
        .replace(cleanRegex, "")
        .replace(/[\r\n]+/g, " ");

      // ⚡ Truncate to first 12k chars for speed
      const truncatedContent = cleanedContent.slice(0, 12000);

      // Prepare LLM prompt
      const summaryPrompt = `
Summarize the following Evolent guideline content based on the user's query.
The summary should be concise, factual, and directly address the query.

User's Query: ${input.query}

Document Content:
${truncatedContent}
      `;

      // ⚡ Direct LLM call (no chain overhead)
      const result = await llmSummarizer.invoke([
        { role: "user", content: summaryPrompt },
      ]);

      return `Evolent Coverage Guideline(s) for '${input.query}':\n\n${result.content}`;
    } catch (error: any) {
      console.error("Error in EvolentSearchTool:", error);
      return `Error calling Evolent API for '${input.query}': ${error.message}`;
    }
  }
}
