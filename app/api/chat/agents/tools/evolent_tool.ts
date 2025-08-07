import { z } from "zod";
import { StructuredTool, ToolRunnableConfig } from "@langchain/core/tools";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { loadSummarizationChain } from "langchain/chains";
import { ChatOpenAI } from "@langchain/openai"; // Or another LLM of your choice
import { cleanRegex } from "./utils";

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
      return `Error: ${error.message}`;
    }
  }

  // Internal method to fetch, clean, and summarize the content
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
      const body: { "@search.score": number; id: string; content: string } =
        relevantData.value[0];

      if (!body || !body.content) {
        return `No Evolent data found for '${input.query}'.`;
      }

      // Perform initial cleaning of boilerplate text
      const cleanedContent = body.content
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

      // 1. Create a document splitter
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 4000, // Adjust based on your LLM's context window
        chunkOverlap: 200,
      });

      // 2. Split the cleaned content into smaller documents
      const docs = await splitter.createDocuments([cleanedContent]);

      // Check if there are no documents to summarize
      if (docs.length === 0) {
        return `No substantial content found for summarization for '${input.query}'.`;
      }

      // 3. Initialize your LLM
      const llm = new ChatOpenAI({
        modelName: "gpt-3.5-turbo-16k", // Using a larger context window model is recommended
        temperature: 0,
      });

      // 4. Create a summarization chain
      const chain = loadSummarizationChain(llm, { type: "map_reduce" });

      // 5. Run the chain to get a final summary
      const result = await chain.invoke({
        input_documents: docs,
      });

      return `Evolent Coverage Guideline(s) for '${input.query}':\n\n${result.text}`;
    } catch (error: any) {
      return `Error calling Evolent API or processing data: ${error.message}`;
    }
  }
}
