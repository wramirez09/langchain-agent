import { StructuredTool } from "@langchain/core/tools";
import { cache, TTL } from "@/lib/cache";
import {
  MedicareSearchInputSchema,
  MedicareSearchInput,
  MedicareScoredResult,
  normalizeInput,
} from "./utils/medicareSearchTypes";
import { scoreMedicareLCD } from "./utils/scoreMedicareDocument";
import { resolveCmsStateId } from "./cmsStateIds";

const CACHE_TTL = 5 * 60 * 1000;

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
    "- cpt: CPT/HCPCS  (optional)\n" +
    "- icd10: ICD-10 code(s) (optional)\n" +
    "- state: U.S. state (REQUIRED — LCDs are scoped to MAC regions; the tool returns an empty result if state is missing)\n" +
    "- maxResults: Number of results (optional, default: 10)\n\n" +
    "**Output:** Returns structured JSON with topMatches array. Each match includes title, displayId, documentId, documentVersion, score, matchedOn signals, URL, and MAC contractor info.\n\n" +
    "**Next step:** For full policy content, call `medicare_policy_detail` with " +
    "`{ documentType: \"lcd\", documentId, documentVersion }` from a top match. " +
    "Do NOT call `policy_content_extractor` for cms.gov/medicare.gov URLs.";

  private CMS_LOCAL_LCDS_API_URL =
    "https://api.coverage.cms.gov/v1/reports/local-coverage-final-lcds/";

  private resolveStateId(stateName: string): number | null {
    return resolveCmsStateId(stateName);
  }

  async _call(input: MedicareSearchInput): Promise<string> {
    const normalized = normalizeInput(input);
    const cacheKey = `lcd-search:${JSON.stringify(normalized)}`;
    const cachedResult: string | null = cache.get(cacheKey);
    if (cachedResult) {
      console.log(`[LocalLcdSearchTool] Cache hit for query: "${normalized.query}"`);
      return cachedResult;
    }

    console.log(`[LocalLcdSearchTool] Searching LCDs:`, JSON.stringify(normalized));

    // LCDs are state-scoped by definition (each MAC region covers specific
    // states). Without a state, the tool would fetch ~840 records (~370KB,
    // 8s cold) and score all of them, almost always producing noise.
    // Require state explicitly so the agent asks the user when missing.
    if (!normalized.state) {
      return JSON.stringify({
        query: normalized,
        topMatches: [],
        message:
          "LCD search requires a U.S. state. Ask the user which state the patient is in (or which MAC region the provider bills under), then call this tool again with the `state` field set.",
      });
    }

    try {
      const toolStart = Date.now();
      let stateId: number | null = null;

      {
        stateId = this.resolveStateId(normalized.state);
        if (!stateId) {
          console.warn(`[LocalLcdSearchTool] No state_id found for: "${normalized.state}"`);
          return JSON.stringify({
            query: normalized,
            topMatches: [],
            message: `Could not find a valid state ID for '${normalized.state}'. Please provide a valid U.S. state name.`,
          });
        }
        console.log(`[LocalLcdSearchTool] State ID resolved: "${normalized.state}" → ${stateId}`);
      }

      const apiUrl = stateId
        ? `${this.CMS_LOCAL_LCDS_API_URL}?state_id=${stateId}&status=A`
        : `${this.CMS_LOCAL_LCDS_API_URL}?status=A`;
      const rawCacheKey = `cms-lcd-raw-data:${stateId ?? "all"}`;

      let allLcds: any = cache.get(rawCacheKey);
      if (allLcds) {
        console.log(`[LocalLcdSearchTool] Raw data cache hit (${allLcds.data?.length ?? 0} records)`);
      } else {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        console.log(`[LocalLcdSearchTool] Fetching LCDs from CMS API (state_id=${stateId ?? "all"})...`);
        const fetchStart = Date.now();
        const lcdsResponse = await fetch(apiUrl, { signal: controller.signal });
        clearTimeout(timeout);
        console.log(`[LocalLcdSearchTool] CMS fetch: ${Date.now() - fetchStart}ms`);

        if (!lcdsResponse.ok) throw new Error(`Failed to fetch LCDs: ${lcdsResponse.status} ${lcdsResponse.statusText}`);

        const parseStart = Date.now();
        allLcds = await lcdsResponse.json();
        const rawSize = JSON.stringify(allLcds).length;
        console.log(`[LocalLcdSearchTool] JSON parse: ${Date.now() - parseStart}ms, ${allLcds?.data?.length ?? 0} records, ${(rawSize / 1024).toFixed(1)}KB`);
        cache.set(rawCacheKey, allLcds, TTL.LONG);
      }

      if (!Array.isArray(allLcds?.data)) {
        console.error("[LocalLcdSearchTool] Unexpected response shape", allLcds);
        return JSON.stringify({
          query: normalized,
          topMatches: [],
          error: "Unexpected CMS API response format. Please try again later."
        });
      }

      if (allLcds.data.length === 0) {
        return JSON.stringify({
          query: normalized,
          topMatches: [],
          message: `No LCDs found${normalized.state ? ` for state: ${normalized.state}` : ""}.`,
        });
      }

      const scoreStart = Date.now();
      const scored = allLcds.data
        .map((lcd: any) => { const { score, matchedOn } = scoreMedicareLCD(lcd, input); return { lcd, score, matchedOn }; })
        .filter((item: any) => item.score > 0)
        .sort((a: any, b: any) => b.score - a.score);
      console.log(`[LocalLcdSearchTool] Scored ${allLcds.data.length} records: ${Date.now() - scoreStart}ms → ${scored.length} matches`);

      if (scored.length === 0) {
        return JSON.stringify({
          query: normalized,
          topMatches: [],
          message: `No LCD found for '${normalized.query}'${normalized.state ? ` in ${normalized.state}` : ""}.`,
        });
      }

      const top = scored.slice(0, normalized.maxResults);
      const topMatches: MedicareScoredResult[] = top.map(({ lcd, score, matchedOn }: any) => ({
        id: `${lcd.document_id}-${lcd.document_version}`,
        title: lcd.title || "N/A",
        displayId: lcd.document_display_id || undefined,
        documentId: lcd.document_id != null ? String(lcd.document_id) : undefined,
        documentVersion: typeof lcd.document_version === "number"
          ? lcd.document_version
          : lcd.document_version != null ? Number(lcd.document_version) : undefined,
        score,
        url: lcd.url || undefined,
        matchedOn,
        metadata: {
          contractor: lcd.contractor_name_type || undefined,
        },
      }));

      const result = JSON.stringify({ query: normalized, topMatches }, null, 2);
      cache.set(cacheKey, result, TTL.LONG);
      console.log(`[LocalLcdSearchTool] Output to LLM: ${result.length} chars (~${(result.length / 1024).toFixed(1)}KB) for ${topMatches.length} matches, total: ${Date.now() - toolStart}ms`);
      return result;
    } catch (error: any) {
      console.error("[LocalLcdSearchTool] Error:", error.message);
      if (error.name === "AbortError") {
        return JSON.stringify({ query: normalized, topMatches: [], error: "Search timed out. Please try again with a more specific query." });
      }
      return JSON.stringify({ query: normalized, topMatches: [], error: "Error searching LCD coverage information. Please try again later." });
    }
  }
}

export const localLcdSearchTool = new LocalLcdSearchTool();
