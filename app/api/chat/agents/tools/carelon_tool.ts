import { z } from "zod"; // For input schema validation
import { StructuredTool, ToolRunnableConfig } from "@langchain/core/tools"; // Or from 'langchain/tools' in older versions
import markdownToTxt from "markdown-to-txt";

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
    const carlonApiQuery = encodeURI(
      "https://ai-aug-carelon-hxdxaeczd9b4fdfc.canadacentral-01.azurewebsites.net/api/search?" +
        `q=${input.query}`,
    );

    try {
      // Fetch all carelon data
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
      const outputResults = body.map((c) => {
        return c.content.replace(/\r/g, "").replace(/\n/g, "");
      });

      console.log({ outputResults });

      if (!relevantData) {
        return `No Carelon data found for '${input.query}'.`;
      }

      return `Found Carelon Coverage Guideline(s) for '${input.query}'. ${outputResults[0]}`;
    } catch (error: any) {
      return `Error calling Carelon API or processing data: ${error.message}`;
    }
  }
}
