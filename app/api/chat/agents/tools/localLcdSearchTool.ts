import { StructuredTool } from "@langchain/core/tools";
import { cache } from "@/lib/cache";
import {
  MedicareSearchInputSchema,
  MedicareSearchInput,
  MedicareScoredResult,
  normalizeInput,
} from "./utils/medicareSearchTypes";
import { scoreMedicareLCD } from "./utils/scoreMedicareDocument";
import { resolveStateId as resolveStateIdFromStatic } from "@/app/agents/metaData/states";

const CACHE_TTL = 30 * 60 * 1000;
const RAW_DATA_CACHE_TTL = 30 * 60 * 1000;

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
    "- cpt: CPT/HCPCS  (optional)\n" +
    "- icd10: ICD-10 code(s) (optional)\n" +
    "- state: U.S. state for filtering (optional but recommended)\n" +
    "- maxResults: Number of results (optional, default: 10)\n\n" +
    "**Output:** Returns structured JSON with topMatches array. Each match includes title, displayId, score, matchedOn signals, URL, and MAC contractor info.";

  private CMS_LOCAL_LCDS_API_URL =
    "https://api.coverage.cms.gov/v1/reports/local-coverage-final-lcds/";

  private resolveStateId(stateName: string): number | null {
    const result = resolveStateIdFromStatic(stateName);
    if (!result) {
      console.warn(`[LocalLcdSearchTool] No state_id found for: "${stateName}"`);
    }
    return result;
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
      const toolStart = Date.now();
      let stateId: number | null = null;

      if (normalized.state) {
        const stateStart = Date.now();
        stateId = this.resolveStateId(normalized.state);
        console.log(`[LocalLcdSearchTool] State ID resolution: ${Date.now() - stateStart}ms → stateId=${stateId}`);
        if (!stateId) {
          return JSON.stringify({
            query: normalized,
            topMatches: [],
            message: `Could not find a valid state ID for '${normalized.state}'. Please provide a valid U.S. state name.`
          });
        }
      }

      const apiUrl = stateId
        ? `${this.CMS_LOCAL_LCDS_API_URL}?state_id=${stateId}&status=A`
        : `${this.CMS_LOCAL_LCDS_API_URL}?status=A`;
      const rawCacheKey = `cms-lcd-raw-data:${stateId ?? 'all'}`;

      let allLcds: any = await cache.get(rawCacheKey);
      if (allLcds) {
        console.log(`[LocalLcdSearchTool] Raw data cache hit (${allLcds?.data?.length ?? 0} records)`);
      } else {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        console.log(`[LocalLcdSearchTool] Fetching LCDs from: ${apiUrl}`);
        const fetchStart = Date.now();
        const lcdsResponse = await fetch(apiUrl, { signal: controller.signal });

        clearTimeout(timeout);
        console.log(`[LocalLcdSearchTool] CMS fetch: ${Date.now() - fetchStart}ms`);

        if (!lcdsResponse.ok) {
          throw new Error(`Failed to fetch local LCDs: ${lcdsResponse.status} ${lcdsResponse.statusText}`);
        }
        const parseStart = Date.now();
        allLcds = await lcdsResponse.json();
        console.log(`[LocalLcdSearchTool] JSON parse: ${Date.now() - parseStart}ms, ${allLcds?.data?.length ?? 0} records`);
        if (allLcds?.data?.[0]) {
          console.log(`[LocalLcdSearchTool] Sample record fields:`, Object.keys(allLcds.data[0]));
        }
        console.log(`[LocalLcdSearchTool] Raw payload size: ${JSON.stringify(allLcds).length} chars (~${(JSON.stringify(allLcds).length / 1024).toFixed(1)}KB)`);
        await cache.set(rawCacheKey, allLcds, RAW_DATA_CACHE_TTL);
      }

      if (!allLcds.data || allLcds.data.length === 0) {
        return JSON.stringify({
          query: normalized,
          topMatches: [],
          message: `No Local Coverage Determinations (LCDs) found${normalized.state ? ` for state: ${normalized.state}` : ''}.`
        });
      }

      const scoreStart = Date.now();
      const scored = allLcds.data
        .map((lcd: any) => {
          const { score, matchedOn } = scoreMedicareLCD(lcd, input);
          return { lcd, score, matchedOn };
        })
        .filter((item: any) => item.score > 0)
        .sort((a: any, b: any) => b.score - a.score);
      console.log(`[LocalLcdSearchTool] Scoring ${allLcds.data.length} records: ${Date.now() - scoreStart}ms → ${scored.length} matches`);
      console.log(`[LocalLcdSearchTool] Total tool time so far: ${Date.now() - toolStart}ms`);

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
      console.log(`[LocalLcdSearchTool] Output to LLM: ${result.length} chars (~${(result.length / 1024).toFixed(1)}KB)`);

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
