import { z } from "zod";
import { StructuredTool, ToolRunnableConfig } from "@langchain/core/tools";
import { loadSummarizationChain } from "langchain/chains";
import { ChatOpenAI } from "@langchain/openai";
import { Document } from "langchain/document";
import { cleanRegex } from "./utils"; // Assuming this utility is external and works as intended

// Define the input schema for the tool
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
  description = "Searches Evolent Guidelines and provides a summarized policy.";
  schema = EvolentSearchInputSchema;

  async call<TConfig extends ToolRunnableConfig | undefined>(
    input: any,
  ): Promise<any> {
    try {
      const parsedInput = this.schema.parse({ query: input.query });
      return await this._call(parsedInput);
    } catch (error: any) {
      console.error("Error in EvolentSearchTool call method:", error);
      return `Error: An issue occurred while processing your request. Details: ${error.message}`;
    }
  }

  protected async _call(
    input: z.infer<typeof EvolentSearchInputSchema>,
  ): Promise<string> {
    const evolentApiQuery = encodeURI(
      "https://ai-aug-carelon-hxdxaeczd9b4fdfc.canadacentral-01.azurewebsites.net/api/evolent/search?" +
        `q=${input.query}`,
    );

    try {
      const response = await fetch(evolentApiQuery, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const relevantData = await response.json();
      const firstResult = relevantData?.value?.[0];

      if (!firstResult || !firstResult.content) {
        return `No Evolent data found for '${input.query}'.`;
      }

      // Perform initial cleaning of boilerplate text.
      // This regex-based cleaning is kept as is.
      const cleanedContent = firstResult.content
        .replace(
          /auer BG, Long MD\. ACG Clinical Guideline: UlcerativeColitis in Adults\.[\s\S]*?DISCLAIMER\s*\.{5}\s*\d+/g,
          "",
        )
        .replace(/\.{25}[\s\S]*?\.{25}/g, "")
        .replace(
          /\s*Page \d+ of \d+ Evolent Clinical Guideline[\s\S]*?Implementation Date: \w+ \d+\.\.\. \d+[\s\S]*?DISCLAIMER\s*\.{5}\s*\d+/g,
          "",
        )
        .replace(/\\nSTATEMENT[\s\S]*?\.\{4\} 4/g, "")
        .replace(/TABLE OF CONTENTS STATEMENT[\s\S]*?CODING \.\. 2/g, "")
        .replace(/[A-Z\s]+\.{9}[\s\S]*?[A-Z\s]+\.{9}/g, "")
        .replace(cleanRegex, "")
        .replace(/\r/g, "")
        .replace(/\n/g, "");
      // We've removed the .slice(0, 8000) as gpt-4o has a large context window
      // that can handle the full content, which is better for summarization accuracy.

      // Create a single document from the cleaned content.
      const docs = [new Document({ pageContent: cleanedContent })];

      // Initialize the LLM with a valid and powerful model.
      const llm = new ChatOpenAI({
        model: "gpt-4o",
        temperature: 0,
      });

      // Use the 'stuff' summarization chain for efficiency.
      const chain = loadSummarizationChain(llm, { type: "stuff" });
      const result = await chain.invoke({
        input_documents: docs,
      });

      return `Evolent Coverage Guideline(s) for '${input.query}':\n\n${result.text}`;
    } catch (error: any) {
      // More specific error message for better debugging.
      return `Error calling Evolent API for query '${input.query}' or processing data: ${error.message}`;
    }
  }
}
