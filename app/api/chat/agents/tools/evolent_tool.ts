import { z } from "zod"; // For input schema validation
import { StructuredTool, ToolRunnableConfig } from "@langchain/core/tools"; // Or from 'langchain/tools' in older versions
import markdownToTxt from "markdown-to-txt";
import { cleanRegex } from "./utils";
import { replace } from "lodash";

// Define the input schema for the tool using Zod
const NCDSearchInputSchema = z.object({
  query: z
    .string()
    .describe(
      "The disease or treatment query to search for in Evolent guidelines.",
    ),
});

// Implement the tool class
export class EvolentSearchTool extends StructuredTool<
  typeof NCDSearchInputSchema
> {
  name = "Evolent_guidelines_search";
  description = "Querys Evolent Guidelines search API and returns payload";
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
      console.error("Error in EvolentSearchTool call method:", error);
      return `Error: ${error.message}`;
    }
  }

  // Internal method for processing the query
  protected async _call(
    input: z.infer<typeof NCDSearchInputSchema>,
  ): Promise<string> {
    const carlonApiQuery = encodeURI(
      "https://ai-aug-carelon-hxdxaeczd9b4fdfc.canadacentral-01.azurewebsites.net/api/evolent/search?" +
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
      const outputResults = body.map((c) => {
        return c.content
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
      });

      console.log("EVA", outputResults.length);

      if (!relevantData) {
        return `No Evolent data found for '${input.query}'.`;
      }

      return `Found Evolent Coverage Guideline(s) for '${input.query}'. ${outputResults[0]}`;
    } catch (error: any) {
      return `Error calling Evolent API or processing data: ${error.message}`;
    }
  }
}
