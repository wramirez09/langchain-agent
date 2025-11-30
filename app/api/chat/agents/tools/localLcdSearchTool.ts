// localLcdSearchTool.ts
import { z } from "zod";
import { StructuredTool, Tool } from "@langchain/core/tools";
import { llmSummarizer } from "@/lib/llm";

// Input schema for the LCD search tool
const LocalLcdSearchInputSchema = z.object({
  query: z
    .string()
    .describe(
      "The disease or treatment query to search for in Local Coverage Determinations (LCDs).",
    ),
  state: z
    .object({ state_id: z.number(), description: z.string() })
    .describe(
      "The id of the state (e.g., 'Illinois', 'California') to filter LCDs. and description of the state as the corresponding state name.",
    ),
});

// Interface for state metadata from the CMS API

// Interface for the expected structure of an LCD document from the API
const cache = new Map<string, string>();

interface LocalCoverageDetermination {
  data: Array<{
    document_id: "string";
    document_version: 0;
    document_display_id: "string";
    document_type: "string";
    note: "string";
    title: "string";
    contractor_name_type: "string";
    updated_on: "string";
    updated_on_sort: "string";
    effective_date: "string";
    retirement_date: "string";
    url: "string";
  }>;
}

class LocalLcdSearchTool extends StructuredTool<
  typeof LocalLcdSearchInputSchema
> {
  name = "local_lcd_search";
  schema = LocalLcdSearchInputSchema;
  description =
    "Searches Local Coverage Determinations (LCDs) for a given disease or treatment query within a specific state. " +
    "LCDs define coverage criteria specific to a Medicare Administrative Contractor (MAC) region and often include detailed medical necessity guidelines. " +
    "Returns the LCD title, display ID, MAC, CPT codes ICD codes and the direct URL for relevant LCDs. " +
    "If multiple LCDs are found, it lists up to 10.";

  private CMS_LOCAL_LCDS_API_URL =
    "https://api.coverage.cms.gov/v1/reports/local-coverage-final-lcds/";

  private async fetchAndSummarizeLcd(url: string, query: string): Promise<string> {
    try {
      const response = await fetch(url);
      const html = await response.text();

      // Create a prompt for summarization
      const messages = [
        { type: "system" as const, content: "You are a helpful assistant that summarizes HTML content from medical coverage documents." },
        {
          type: "human" as const, content: `Please provide a concise summary of the following HTML content focusing on how it relates to the query: "${query}"
        
        HTML Content:
        ${html.substring(0, 8000)}`
        } // Limiting length to avoid token limits
      ];

      const summary = await llmSummarizer("local-lcd-search-summerizer").invoke(messages);
      return summary.content as string;
    } catch (error: any) {
      console.error("Error fetching and summarizing LCD:", error);
      return "[Failed to summarize]";
    }
  }

  protected async _call(input: z.infer<typeof LocalLcdSearchInputSchema>): Promise<string> {
    if (cache.has(input.toString())) {
      console.log("LocalLcdSearchTool: Cache hit!");
      return cache.get(input.toString())!;
    }
    const { query, state } = input;

    try {
      // 1. Get the two-letter state ID from the full state name.
      if (!state || !state.state_id) {
        return `Error: Could not find a valid state ID for '${state.description}'. Please provide a full, valid U.S. state name.`;
      }

      // 2. Fetch Local Coverage Determinations for the specific state.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const lcdsResponse = await fetch(
        `${this.CMS_LOCAL_LCDS_API_URL}?state_id=${state.state_id}&status=A`,
        {
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

      if (!lcdsResponse.ok) {
        throw new Error(
          `Failed to fetch local LCDs for ${state}: ${lcdsResponse.status} ${lcdsResponse.statusText}`,
        );
      }
      const allLcds: LocalCoverageDetermination = await lcdsResponse.json();

      // 3. Perform client-side filtering based on the query.
      const queryLower = query.toLowerCase();
      const p1 = queryLower.split("(")[0].trim();
      const p2 = queryLower
        .substring(queryLower.indexOf("(") + 1, queryLower.indexOf(")"))
        .trim();

      const lcds: any = [];

      allLcds.data.filter((lcd) => {
        const titleLower = (lcd.title || "").toLowerCase();
        // Check if the query is in the title
        if (titleLower.includes(p1)) lcds.push(lcd);
        if (titleLower.includes(p2)) lcds.push(lcd);
      });

      // 4. Handle cases where no relevant LCDs are found.
      if (lcds.length === 0) {
        return `No Local Coverage Determination (LCD) found for '${query}' in ${state}.`;
      }

      // 5. Format the output to be returned to the LLM.
      const outputResults: string[] = [];
      // Limit results to a reasonable number.
      const maxResults = Math.min(lcds.length, 3); // Reduced to 3 to manage API calls

      for (let i = 0; i < maxResults; i++) {
        const lcd = lcds[i];
        // Construct the full, clickable URL for the LCD's detailed page on CMS.gov.
        const fullHtmlUrl = lcd.url ? `${lcd.url}` : "URL N/A";

        // Get summary for this LCD
        const summary = lcd.url
          ? await this.fetchAndSummarizeLcd(lcd.url, query)
          : "[No URL available for summarization]";

        outputResults.push(
          `## ${lcd.title} (ID: ${lcd.document_display_id || 'N/A'})\n` +
          `- **MAC:** ${lcd.contractor_name_type || 'N/A'}\n` +
          `- **Effective Date:** ${lcd.effective_date || 'N/A'}\n` +
          `- **Last Updated:** ${lcd.updated_on || 'N/A'}\n` +
          `- **Summary:** ${summary}\n` +
          `- **Direct URL:** ${fullHtmlUrl}\n`
        );
      }

      console.log(`${outputResults.length} LCD's found and summarized`);

      const result = `Found ${lcds.length} Local Coverage Determination(s) for '${query}' in ${state}. ` +
        `Displaying top ${maxResults} with summaries:\n\n` +
        outputResults.join("\n\n");

      cache.set(input.toString(), result);
      return result;
    } catch (error: any) {
      console.error("Error in LocalLcdSearchTool:", error);
      return `An error occurred while searching for local LCDs: ${error.message}`;
    }
  }
}

// Instantiate and export the tool.
export const localLcdSearchTool = new LocalLcdSearchTool();
