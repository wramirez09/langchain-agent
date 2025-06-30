import { z } from "zod"; // For input schema validation
import { StructuredTool, ToolRunnableConfig } from "@langchain/core/tools"; // Or from 'langchain/tools' in older versions

// Define the input schema for the tool using Zod
const NCDSearchInputSchema = z.object({
  query: z
    .string()
    .describe(
      "The disease or treatment query to search for in Carelon guidelines.",
    ),
});

// Implement the tool class
export class CarelonSearchTool extends StructuredTool<
  typeof NCDSearchInputSchema
> {
  name = "carelon_guidelines_search";
  description = "Querys Carelon Guidelines search API and returns payload";
  schema = NCDSearchInputSchema;

  // Public call method for LangChain LLM
  async call<
    TArg extends unknown,
    TConfig extends ToolRunnableConfig | undefined,
  >(input: any, configArg?: TConfig): Promise<any> {
    try {
      // Parse and validate the input using the schema

      const parsedInput = this.schema.parse({ query: input.query });
      return await this._call(parsedInput);
    } catch (error: any) {
      console.error("Error in CarelonSearchTool call method:", error);
      return `Error: ${error.message}`;
    }
  }

  // Internal method for processing the query
  protected async _call(
    input: z.infer<typeof NCDSearchInputSchema>,
  ): Promise<string> {
    var carlonApiQuery =
      "https://ai-aug-carelon-hxdxaeczd9b4fdfc.canadacentral-01.azurewebsites.net/api/search?" +
      `q=${input.query}`;

    try {
      // Fetch all NCDs from the CMS API
      const response = await fetch(carlonApiQuery, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      var carelonData = await response.json();

      // Filter NCDs based on the query
      var queryLower = input.query.toLowerCase();

        console.log("carelonData keys:", Object.keys(carelonData));
        console.log("carelonData.value length:", carelonData.value?.length);

        var relevantData = carelonData.value || []; // array of actual results

        if (relevantData.length === 0) {
            return `No National Coverage Determination (NCD) found for '${input.query}'.`;
        }

      // Format the output for the top 5 results
      const outputResults: string[] = [];

      return `Found ${relevantData.length} Carelon Coverage Guideline(s) for '${input.query}'.`;
    } catch (error: any) {
      return `Error calling CMS API or processing data: ${error.message}`;
    }
  }
}
