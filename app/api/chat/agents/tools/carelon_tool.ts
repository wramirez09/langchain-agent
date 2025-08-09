import { z } from "zod"; // For input schema validation
import { StructuredTool, ToolRunnableConfig } from "@langchain/core/tools"; // Or from 'langchain/tools' in older versions

import { cleanRegex } from "./utils";

// Define the input schema for the tool using Zod
const NCDSearchInputSchema = z.object({
  treatment: z.string(),
  diagnosis: z.string(),
});

// Implement the tool class
export class CarelonSearchTool extends StructuredTool<
  typeof NCDSearchInputSchema
> {
  name = "carelon_guidelines_search";
  description = "Querys Carelon Guidelines search API and returns payload";
  schema = NCDSearchInputSchema;

  // Public call method for LangChain LLM
  async call<TConfig extends ToolRunnableConfig | undefined>(
    input: any,
  ): Promise<any> {
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
        `q=${input.treatment + " " + input.diagnosis}`,
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
      const outputResults = body.map((c) => {
        return c.content
          .replace(/\.{25}[\s\S]*?\.{25}/g, "")
          .replace(/\\nSTATEMENT[\s\S]*?\.\{4\} 4/g, "")
          .replace(cleanRegex, "")
          .replace(/\r/g, "")
          .replace(/\n/g, "");
      });

      if (!relevantData) {
        return `No Carelon data found for '${input.treatment}'.`;
      }

      return `Found Carelon Coverage Guideline(s) for '${input.treatment}'. ${outputResults[0]}`;
    } catch (error: any) {
      return `Error calling Carelon API or processing data: ${error.message}`;
    }
  }
}
