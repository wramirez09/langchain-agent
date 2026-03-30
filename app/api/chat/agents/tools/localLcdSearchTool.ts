import { StructuredTool } from "@langchain/core/tools";
import { cache } from "@/lib/cache";
import {
  MedicareSearchInputSchema,
  MedicareSearchInput,
  MedicareScoredResult,
  normalizeInput,
} from "./utils/medicareSearchTypes";
import { scoreMedicareLCD } from "./utils/scoreMedicareDocument";

const CACHE_TTL = 5 * 60 * 1000;

interface StateMetadata {
  data: Array<{
    state_id: number;
    description: string;
  }>;
}

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

class LocalLcdSearchTool extends StructuredTool<typeof MedicareSearchInputSchema> {
  name = "local_lcd_search";
  schema = MedicareSearchInputSchema;
  description =
    "Searches Local Coverage Determinations (LCDs) for Medicare coverage policies specific to a state. " +
    "LCDs define coverage criteria for Medicare Administrative Contractor (MAC) regions. " +
    "Uses deterministic scoring to rank LCDs by relevance. " +
    "Returns structured JSON with topMatches containing scored results.\n\n" +
    "**Input fields:**\n" +
    "- query: Main search query (required) - treatment, diagnosis, or LCD number\n" +
    "- treatment: Specific treatment name (optional)\n" +
    "- diagnosis: Diagnosis description (optional)\n" +
    "- cpt: CPT code(s) (optional)\n" +
    "- icd10: ICD-10 code(s) (optional)\n" +
    "- state: U.S. state for filtering (optional but recommended)\n" +
    "- maxResults: Number of results (optional, default: 10)\n\n" +
    "**Output:** Returns structured JSON with topMatches array. Each match includes title, displayId, score, matchedOn signals, URL, and MAC contractor info.";

  private CMS_LOCAL_LCDS_API_URL =
    "https://api.coverage.cms.gov/v1/reports/local-coverage-final-lcds/";
  private CMS_STATES_API_URL =
    "https://api.coverage.cms.gov/v1/meta/states";

  private stateCache: Map<string, number> = new Map();

  private async resolveStateId(stateName: string): Promise<number | null> {
    const normalized = stateName.toLowerCase().trim();
    
    if (this.stateCache.has(normalized)) {
      return this.stateCache.get(normalized)!;
    }

    try {
      const response = await fetch(this.CMS_STATES_API_URL);
      const statesData: StateMetadata = await response.json();
      
      for (const state of statesData.data) {
        const stateDesc = state.description.toLowerCase();
        this.stateCache.set(stateDesc, state.state_id);
        
        if (stateDesc === normalized || stateDesc.includes(normalized)) {
          return state.state_id;
        }
      }
    } catch (error) {
      console.error("[LocalLcdSearchTool] Error resolving state ID:", error);
    }
    
    return null;
  }

  async _call(input: MedicareSearchInput): Promise<string> {
    const normalized = normalizeInput(input);
    const cacheKey = `lcd-search:${JSON.stringify(normalized)}`;
    const cachedResult: string | null = await cache.get(cacheKey);

    if (cachedResult) {
      console.log(`[LocalLcdSearchTool] Cache hit for query: "${normalized.query}"`);
      return cachedResult;
    }

    console.log(
      `[LocalLcdSearchTool] Searching LCDs with input:`,
      JSON.stringify(normalized, null, 2)
    );

    try {
      let stateId: number | null = null;
      
      if (normalized.state) {
        stateId = await this.resolveStateId(normalized.state);
        if (!stateId) {
          return JSON.stringify({
            query: normalized,
            topMatches: [],
            message: `Could not find a valid state ID for '${normalized.state}'. Please provide a valid U.S. state name.`
          });
        }
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const apiUrl = stateId
        ? `${this.CMS_LOCAL_LCDS_API_URL}?state_id=${stateId}&status=A`
        : `${this.CMS_LOCAL_LCDS_API_URL}?status=A`;

      console.log(`[LocalLcdSearchTool] Fetching LCDs from: ${apiUrl}`);

      const lcdsResponse = await fetch(apiUrl, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!lcdsResponse.ok) {
        throw new Error(
          `Failed to fetch local LCDs: ${lcdsResponse.status} ${lcdsResponse.statusText}`
        );
      }
      const allLcds = await lcdsResponse.json();

      if (!allLcds.data || allLcds.data.length === 0) {
        return JSON.stringify({
          query: normalized,
          topMatches: [],
          message: `No Local Coverage Determinations (LCDs) found${normalized.state ? ` for state: ${normalized.state}` : ''}.`
        });
      }

      const scored = allLcds.data
        .map((lcd: any) => {
          const { score, matchedOn } = scoreMedicareLCD(lcd, input);
          return { lcd, score, matchedOn };
        })
        .filter((item: any) => item.score > 0)
        .sort((a: any, b: any) => b.score - a.score);

      console.log(
        `[LocalLcdSearchTool] ${scored.length} scored matches for query "${normalized.query}"`
      );

      if (scored.length === 0) {
        return JSON.stringify({
          query: normalized,
          topMatches: [],
          message: `No Local Coverage Determination (LCD) found for '${normalized.query}'${normalized.state ? ` in ${normalized.state}` : ''}.`
        });
      }

      const top = scored.slice(0, normalized.maxResults);
      const topMatches: MedicareScoredResult[] = top.map(({ lcd, score, matchedOn }: any) => {
        return {
          id: `${lcd.document_id}-${lcd.document_version}`,
          title: lcd.title || "N/A",
          displayId: lcd.document_display_id || undefined,
          score,
          url: lcd.url || undefined,
          matchedOn,
          metadata: {
            contractor: lcd.contractor_name_type || undefined,
            effectiveDate: lcd.effective_date || undefined,
            lastUpdated: lcd.updated_on || undefined,
            retirementDate: lcd.retirement_date || undefined,
          },
        };
      });

      const result = JSON.stringify(
        {
          query: normalized,
          topMatches,
        },
        null,
        2
      );

      console.log(
        `[LocalLcdSearchTool] Returning ${topMatches.length} results with scores:`,
        topMatches.map(m => ({ title: m.title, score: m.score, matchedOn: m.matchedOn }))
      );

      await cache.set(cacheKey, result, CACHE_TTL);
      return result;
    } catch (error: any) {
      console.error("[LocalLcdSearchTool] Error in LCD search:", error);
      if (error.name === "AbortError") {
        return JSON.stringify({
          query: normalized,
          topMatches: [],
          error: "Search timed out. Please try again with a more specific query."
        });
      }
      return JSON.stringify({
        query: normalized,
        topMatches: [],
        error: "Error searching for LCD coverage information. Please try again later."
      });
    }
  }
}

// Instantiate and export the tool.
export const localLcdSearchTool = new LocalLcdSearchTool();
