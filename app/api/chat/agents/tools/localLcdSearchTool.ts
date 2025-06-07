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
    .string()
    .describe(
      "The full name of the state (e.g., 'Illinois', 'California') to filter LCDs.",
    ),
});

// Interface for state metadata from the CMS API
interface StateMetaData {
  data: Array<{
    description: string;
    state_id: number;
  }>;
}

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
    "Returns the LCD title, display ID, MAC, and the direct URL for relevant LCDs. " +
    "If multiple LCDs are found, it lists up to 5.";
  schema = LocalLcdSearchInputSchema;

  // CMS API URLs for state metadata and local LCDs
  private CMS_STATE_METADATA_API_URL =
    "https://api.coverage.cms.gov/v1/metadata/states/";
  private CMS_LOCAL_LCDS_API_URL =
    "https://api.coverage.cms.gov/v1/reports/local-coverage-final-lcds/";
  private CMS_LCD_BASE_HTML_URL =
    "https://www.cms.gov/medicare-coverage-database/details/lcd-details.aspx";

  // Static cache for state IDs to avoid repeated API calls for state metadata
  private static stateIdCache: Map<string, number> | null = null;

  /**
   * Fetches and caches the mapping of state names to state IDs.
   * @returns A Map from lowercase state name to two-letter state ID.
   */
  private async getStatesMetadata(): Promise<Map<string, number>> {
    if (LocalLcdSearchTool.stateIdCache) {
      return LocalLcdSearchTool.stateIdCache;
    }
    const response = await fetch(this.CMS_STATE_METADATA_API_URL);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch state metadata: ${response.status} ${response.statusText}`,
      );
    }
    const states: StateMetaData = await response.json();
    const stateMap = new Map<string, number>();
    states.data.forEach((state) => {
      stateMap.set(state.description.toLowerCase(), state.state_id);
    });
    LocalLcdSearchTool.stateIdCache = stateMap;
    return stateMap;
  }

  /**
   * The core logic of the tool that gets executed when the LLM calls it.
   * @param input The validated input from the LLM, matching LocalLcdSearchInputSchema.
   * @returns A string summarizing the found LCDs or an error message.
   */
  protected async _call(
    input: z.infer<typeof LocalLcdSearchInputSchema>,
  ): Promise<string> {
    const { query, state } = input;
    try {
      // 1. Get the two-letter state ID from the full state name.
      const stateMap = await this.getStatesMetadata();
      const stateId = stateMap.get(state.toLowerCase());

      if (!stateId) {
        return `Error: Could not find a valid state ID for '${state}'. Please provide a full, valid U.S. state name.`;
      }

      // 2. Fetch Local Coverage Determinations for the specific state.
      // Request 'Final' status to get currently active policies.
      const lcdsResponse = await fetch(
        `${this.CMS_LOCAL_LCDS_API_URL}?state_id=${stateId}`,
      );
      if (!lcdsResponse.ok) {
        throw new Error(
          `Failed to fetch local LCDs for ${state}: ${lcdsResponse.status} ${lcdsResponse.statusText}`,
        );
      }
      const allLcds: LocalCoverageDetermination = await lcdsResponse.json();
      console.log({ allLcds });
      // 3. Perform client-side filtering based on the query.
      const queryLower = query.toLowerCase();
      const relevantLcds = allLcds.data.filter((lcd) => {
        const titleLower = (lcd.title || "").toLowerCase();
        // Check if the query is in the title or summary
        return titleLower.includes(queryLower);
      });

      // 4. Handle cases where no relevant LCDs are found.
      if (relevantLcds.length === 0) {
        return `No Local Coverage Determination (LCD) found for '${query}' in ${state}.`;
      }

      // 5. Format the output to be returned to the LLM.
      const outputResults: string[] = [];
      // Limit results to a reasonable number.
      for (let i = 0; i < Math.min(relevantLcds.length, 5); i++) {
        const lcd = relevantLcds[i];
        // Construct the full, clickable URL for the LCD's detailed page on CMS.gov.
        const fullHtmlUrl = lcd.url && lcd.url ? `${lcd.url}` : "URL N/A";

        outputResults.push(
          `  - Title: '${lcd.title}' (ID: ${lcd.document_display_id})\n` +
            `    MAC: ${lcd.contractor_name_type}\n` +
            `    Direct URL (check for coverage criteria here): ${fullHtmlUrl}`,
        );
      }

      return (
        `Found ${relevantLcds.length} Local Coverage Determination(s) for '${query}' in ${state}. ` +
        `Displaying top ${Math.min(relevantLcds.length, 5)}:\n` +
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
