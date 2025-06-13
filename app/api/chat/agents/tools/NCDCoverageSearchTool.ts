import { z } from "zod"; // For input schema validation
import { StructuredTool, ToolRunnableConfig } from "@langchain/core/tools"; // Or from 'langchain/tools' in older versions

// Define the input schema for the tool using Zod
const NCDSearchInputSchema = z.object({
  query: z
    .string()
    .describe(
      "The disease or treatment query to search for in National Coverage Determinations (NCDs).",
    ),
});

// Implement the tool class
export class NCDCoverageSearchTool extends StructuredTool<
  typeof NCDSearchInputSchema
> {
  name = "ncd_coverage_search";
  description =
    "Searches National Coverage Determinations (NCDs) for a given disease or treatment query. " +
    "Returns the title, document display ID, and the direct URL for relevant NCDs. " +
    "If multiple NCDs are found, it lists up to 10.";
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
      console.error("Error in NCDCoverageSearchTool call method:", error);
      return `Error: ${error.message}`;
    }
  }

  // Internal method for processing the query
  protected async _call(
    input: z.infer<typeof NCDSearchInputSchema>,
  ): Promise<string> {
    const CMS_NCD_API_URL =
      "https://api.coverage.cms.gov/v1/reports/national-coverage-ncd/";
    const CMS_NCD_BASE_HTML_URL = "https://api.coverage.cms.gov/v1/data/";

    try {
      // Fetch all NCDs from the CMS API
      const response = await fetch(CMS_NCD_API_URL, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const allNCDs = await response.json();

      // Filter NCDs based on the query
      const queryLower = input.query.toLowerCase();

      const relevantNCDs = allNCDs.data.filter((ncd: any) => {
        const titleLower = (ncd.title || "").toLowerCase();

        const documentDisplayIdLower = (
          ncd.document_display_id || ""
        ).toLowerCase();
        return (
          titleLower.includes(queryLower) ||
          documentDisplayIdLower.includes(queryLower)
        );
      });

      if (relevantNCDs.length === 0) {
        return `No National Coverage Determination (NCD) found for '${input.query}'.`;
      }

      // Format the output for the top 5 results
      const outputResults: string[] = [];
      for (let i = 0; i < Math.min(relevantNCDs.length, 5); i++) {
        const ncd = relevantNCDs[i];
        const documentId = ncd.document_id;
        const documentVersion = ncd.document_version;
        const documentDisplayId = ncd.document_display_id;
        const title = ncd.title;

        const fullHtmlUrl =
          documentId && documentVersion
            ? `${CMS_NCD_BASE_HTML_URL}ncd?ncdid=${documentId}&ncdver=${documentVersion}`
            : "URL N/A";

        outputResults.push(
          `  - Title: '${title}' (ID: ${documentDisplayId})\n` +
            `    Direct URL for details: ${fullHtmlUrl}`,
        );
      }

      return (
        `Found ${relevantNCDs.length} National Coverage Determination(s) for '${input.query}'. ` +
        `Displaying top ${Math.min(relevantNCDs.length, 10)}:\n` +
        outputResults.join("\n")
      );
    } catch (error: any) {
      return `Error calling CMS API or processing data: ${error.message}`;
    }
  }
}
