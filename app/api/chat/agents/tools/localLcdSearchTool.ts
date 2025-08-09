// localLcdSearchTool.ts
import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";

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
  description =
    "Searches Local Coverage Determinations (LCDs) for a given disease or treatment query within a specific state. " +
    "LCDs define coverage criteria specific to a Medicare Administrative Contractor (MAC) region and often include detailed medical necessity guidelines. " +
    "Returns the LCD title, display ID, MAC, CPT codes ICD codes and the direct URL for relevant LCDs. " +
    "If multiple LCDs are found, it lists up to 10.";
  schema = LocalLcdSearchInputSchema;

  private CMS_LOCAL_LCDS_API_URL =
    "https://api.coverage.cms.gov/v1/reports/local-coverage-final-lcds/";

  private static stateIdCache: Map<string, number> | null = null;

  protected async _call(
    input: z.infer<typeof LocalLcdSearchInputSchema>,
  ): Promise<string> {
    const { query, state } = input;

    try {
      // 1. Get the two-letter state ID from the full state name.

      if (!state || !state.state_id) {
        return `Error: Could not find a valid state ID for '${state.description}'. Please provide a full, valid U.S. state name.`;
      }

      // 2. Fetch Local Coverage Determinations for the specific state.
      // Request 'Final' status to get currently active policies.
      const lcdsResponse = await fetch(
        `${this.CMS_LOCAL_LCDS_API_URL}?state_id=${state.state_id}&status=A`,
      );

      if (!lcdsResponse.ok) {
        throw new Error(
          `Failed to fetch local LCDs for ${state}: ${lcdsResponse.status} ${lcdsResponse.statusText}`,
        );
      }
      const allLcds: LocalCoverageDetermination = await lcdsResponse.json();
      // s
      // 3. Perform client-side filtering based on the query.
      const queryLower = query.toLowerCase();
      const p1 = queryLower.split("(")[0].trim();
      const p2 = queryLower
        .substring(queryLower.indexOf("(") + 1, queryLower.indexOf(")"))
        .trim();

      const lcds: any = [];

      allLcds.data.filter((lcd) => {
        const titleLower = (lcd.title || "").toLowerCase();
        // Check if the query is in the title or summary
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
      for (let i = 0; i < Math.min(lcds.length, 1); i++) {
        const lcd = lcds[i];
        // Construct the full, clickable URL for the LCD's detailed page on CMS.gov.
        const fullHtmlUrl = lcd.url && lcd.url ? `${lcd.url}` : "URL N/A";

        outputResults.push(
          `  - Title: '${lcd.title}' (ID: ${lcd.document_display_id})\n` +
            `    MAC: ${lcd.contractor_name_type}\n` +
            `    Direct URL (check for coverage criteria here): ${fullHtmlUrl}`,
        );
      }

      console.log(`${outputResults.length} LCD's found`, { outputResults });

      return (
        `Found ${lcds.length} Local Coverage Determination(s) for '${query}' in ${state}. ` +
        `Displaying top ${Math.min(lcds.length, 5)}:\n` +
        outputResults.join("\n")
      );
    } catch (error: any) {
      console.error("Error in LocalLcdSearchTool:", error);
      return `An error occurred while searching for local LCDs: ${error.message}`;
    }
  }
}

// Instantiate and export the tool.
export const localLcdSearchTool = new LocalLcdSearchTool();
