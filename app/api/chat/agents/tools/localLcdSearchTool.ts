import { StructuredTool } from "@langchain/core/tools";
import { cache, TTL } from "@/lib/cache";
import {
  MedicareSearchInputSchema,
  MedicareSearchInput,
  MedicareScoredResult,
  normalizeInput,
} from "./utils/medicareSearchTypes";
import {
  getOrBuildHybridIndex,
  scoreHybrid,
  MedicareDoc,
} from "./utils/medicareHybridIndex";
import { resolveCmsStateId } from "./cmsStateIds";

const CMS_LOCAL_LCDS_API_URL =
  "https://api.coverage.cms.gov/v1/reports/local-coverage-final-lcds/";

async function fetchLcdList(stateId: number): Promise<any> {
  const rawCacheKey = `cms-lcd-raw-data:${stateId}`;
  const cached = cache.get<any>(rawCacheKey);
  if (cached) {
    console.log(`[LocalLcdSearchTool] Raw data cache hit (${cached.data?.length ?? 0} records)`);
    return cached;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const url = `${CMS_LOCAL_LCDS_API_URL}?state_id=${stateId}&status=A`;
    console.log(`[LocalLcdSearchTool] Fetching LCDs (state_id=${stateId})...`);
    const fetchStart = Date.now();
    const response = await fetch(url, { signal: controller.signal });
    console.log(`[LocalLcdSearchTool] CMS fetch: ${Date.now() - fetchStart}ms`);
    if (!response.ok) throw new Error(`Failed to fetch LCDs: ${response.status} ${response.statusText}`);
    const data = await response.json();
    cache.set(rawCacheKey, data, TTL.LONG);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

class LocalLcdSearchTool extends StructuredTool<typeof MedicareSearchInputSchema> {
  name = "local_lcd_search";
  schema = MedicareSearchInputSchema;
  description =
    "Searches Local Coverage Determinations (LCDs) for Medicare coverage policies specific to a state. " +
    "LCDs define coverage criteria for Medicare Administrative Contractor (MAC) regions. " +
    "Uses hybrid (semantic + lexical) scoring with state + exact-ID boosts. " +
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

  async _call(input: MedicareSearchInput): Promise<string> {
    const normalized = normalizeInput(input);
    const cacheKey = `lcd-search:v2:${JSON.stringify(normalized)}`;
    const cachedResult: string | null = cache.get(cacheKey);
    if (cachedResult) {
      console.log(`[LocalLcdSearchTool] Cache hit for query: "${normalized.query}"`);
      return cachedResult;
    }

    console.log(`[LocalLcdSearchTool] Searching LCDs:`, JSON.stringify(normalized));

    // LCDs are state-scoped by definition (each MAC region covers specific
    // states). Without a state, the tool would fetch ~840 records and
    // produce mostly noise. Require state explicitly so the agent asks the
    // user when missing.
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
      const stateId = resolveCmsStateId(normalized.state);
      if (!stateId) {
        console.warn(`[LocalLcdSearchTool] No state_id found for: "${normalized.state}"`);
        return JSON.stringify({
          query: normalized,
          topMatches: [],
          message: `Could not find a valid state ID for '${normalized.state}'. Please provide a valid U.S. state name.`,
        });
      }
      console.log(`[LocalLcdSearchTool] State ID resolved: "${normalized.state}" → ${stateId}`);

      const allLcds = await fetchLcdList(stateId);

      if (!Array.isArray(allLcds?.data)) {
        console.error("[LocalLcdSearchTool] Unexpected response shape", allLcds);
        return JSON.stringify({
          query: normalized,
          topMatches: [],
          error: "Unexpected CMS API response format. Please try again later.",
        });
      }

      if (allLcds.data.length === 0) {
        return JSON.stringify({
          query: normalized,
          topMatches: [],
          message: `No LCDs found for state: ${normalized.state}.`,
        });
      }

      const docs: MedicareDoc[] = allLcds.data.map((lcd: any) => ({
        id: `${lcd.document_id}-${lcd.document_version}`,
        title: lcd.title || "",
        displayId: lcd.document_display_id || undefined,
        raw: lcd,
      }));

      const indexStart = Date.now();
      const index = await getOrBuildHybridIndex(`lcd:${stateId}`, docs);
      console.log(`[LocalLcdSearchTool] Index ready: ${Date.now() - indexStart}ms`);

      const scoreStart = Date.now();
      const scored = await scoreHybrid(index, {
        query: normalized.query,
        treatment: normalized.treatment,
        diagnosis: normalized.diagnosis,
        cptCodes: normalized.cptCodes,
        icd10Codes: normalized.icd10Codes,
        state: String(stateId),
        stateName: normalized.state,
      });
      console.log(`[LocalLcdSearchTool] Scored ${allLcds.data.length} records: ${Date.now() - scoreStart}ms → ${scored.length} matches`);

      if (scored.length === 0) {
        return JSON.stringify({
          query: normalized,
          topMatches: [],
          message: `No LCD found for '${normalized.query}' in ${normalized.state}.`,
        });
      }

      const top = scored.slice(0, normalized.maxResults);
      const topMatches: MedicareScoredResult[] = top.map(({ doc, score, matchedOn }) => {
        const lcd = doc.raw as Record<string, any>;
        return {
          id: doc.id,
          title: doc.title || "N/A",
          displayId: doc.displayId,
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
        };
      });

      const result = JSON.stringify({ query: normalized, topMatches });
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
