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

const RAW_DATA_CACHE_KEY = "cms-ncd-raw-data";
const CMS_NCD_API_URL =
  "https://api.coverage.cms.gov/v1/reports/national-coverage-ncd/";
const CMS_NCD_BASE_HTML_URL =
  "https://www.cms.gov/medicare-coverage-database/view/ncd.aspx";

async function fetchNcdList(): Promise<any> {
  const cached = cache.get<any>(RAW_DATA_CACHE_KEY);
  if (cached) {
    console.log(`[NCDCoverageSearchTool] Raw data cache hit (${cached.data?.length ?? 0} records)`);
    return cached;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    console.log("[NCDCoverageSearchTool] Fetching NCD list from CMS API...");
    const fetchStart = Date.now();
    const response = await fetch(CMS_NCD_API_URL, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    console.log(`[NCDCoverageSearchTool] CMS fetch: ${Date.now() - fetchStart}ms`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    cache.set(RAW_DATA_CACHE_KEY, data, TTL.LONG);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export class NCDCoverageSearchTool extends StructuredTool<typeof MedicareSearchInputSchema> {
  name = "ncd_coverage_search";
  schema = MedicareSearchInputSchema;
  description =
    "Searches National Coverage Determinations (NCDs) for Medicare coverage policies. " +
    "Uses hybrid (semantic + lexical) scoring with exact-ID boost. " +
    "Returns structured JSON with topMatches containing scored results.\n\n" +
    "**Input fields:**\n" +
    "- query: Main search query (required) - treatment, diagnosis, or NCD number\n" +
    "- treatment: Specific treatment name (optional)\n" +
    "- diagnosis: Diagnosis description (optional)\n" +
    "- cpt: CPT/HCPCS  (optional)\n" +
    "- icd10: ICD-10 code(s) (optional)\n" +
    "- maxResults: Number of results (optional, default: 10)\n\n" +
    "**Output:** Returns structured JSON with topMatches array. Each match includes title, displayId, documentId, documentVersion, score, matchedOn signals, and URL.\n\n" +
    "**Next step:** For full policy content, call `medicare_policy_detail` with " +
    "`{ documentType: \"ncd\", documentId, documentVersion }` from a top match. " +
    "Do NOT call `policy_content_extractor` for cms.gov/medicare.gov URLs.";

  async _call(input: MedicareSearchInput): Promise<string> {
    const normalized = normalizeInput(input);

    const cacheKey = `ncd-search:v2:${JSON.stringify(normalized)}`;
    const cachedResult: string | null = cache.get(cacheKey);
    if (cachedResult) {
      console.log(`[NCDCoverageSearchTool] Cache hit for query: "${normalized.query}"`);
      return cachedResult;
    }

    console.log(`[NCDCoverageSearchTool] Searching NCDs:`, JSON.stringify(normalized));

    try {
      const responseData = await fetchNcdList();

      if (!responseData || !responseData.meta || !Array.isArray(responseData.data)) {
        console.error("[NCDCoverageSearchTool] Unexpected API response structure");
        return JSON.stringify({ query: normalized, topMatches: [], error: "Unexpected CMS API response format. Please try again later." });
      }

      if (responseData.meta.status && responseData.meta.status.id >= 400) {
        console.error("[NCDCoverageSearchTool] CMS API error:", responseData.meta.status);
        return JSON.stringify({ query: normalized, topMatches: [], error: `CMS Coverage API error: ${responseData.meta.status.message || "Unknown error"}` });
      }

      const allNCDs: any[] = responseData.data || [];
      if (allNCDs.length === 0) {
        return JSON.stringify({ query: normalized, topMatches: [], message: "No NCDs currently available from CMS." });
      }

      const docs: MedicareDoc[] = allNCDs.map((ncd) => ({
        id: `${ncd.document_id}-${ncd.document_version}`,
        title: ncd.title || "",
        displayId: ncd.document_display_id || undefined,
        raw: ncd,
      }));

      const indexStart = Date.now();
      const index = await getOrBuildHybridIndex("ncd", docs);
      console.log(`[NCDCoverageSearchTool] Index ready: ${Date.now() - indexStart}ms`);

      const scoreStart = Date.now();
      const scored = await scoreHybrid(index, {
        query: normalized.query,
        treatment: normalized.treatment,
        diagnosis: normalized.diagnosis,
        cptCodes: normalized.cptCodes,
        icd10Codes: normalized.icd10Codes,
      });
      console.log(`[NCDCoverageSearchTool] Scored ${allNCDs.length} records: ${Date.now() - scoreStart}ms → ${scored.length} matches`);

      if (scored.length === 0) {
        return JSON.stringify({
          query: normalized,
          topMatches: [],
          message: `No NCD found for '${normalized.query}'. Try a simpler phrase, a keyword from the NCD title, or the NCD number (e.g., "220.3").`,
        });
      }

      const top = scored.slice(0, normalized.maxResults);
      const topMatches: MedicareScoredResult[] = top.map(({ doc, score, matchedOn }) => {
        const ncd = doc.raw as Record<string, any>;
        const documentId = ncd.document_id;
        const documentVersion = ncd.document_version;
        const url = documentId != null && documentVersion != null
          ? `${CMS_NCD_BASE_HTML_URL}?ncdid=${documentId}&ncdver=${documentVersion}`
          : undefined;
        return {
          id: doc.id,
          title: doc.title || "N/A",
          displayId: doc.displayId,
          documentId: documentId != null ? String(documentId) : undefined,
          documentVersion: typeof documentVersion === "number"
            ? documentVersion
            : documentVersion != null ? Number(documentVersion) : undefined,
          score,
          url,
          matchedOn,
          metadata: {
            status: ncd.document_status || undefined,
            lastUpdated: ncd.last_updated || undefined,
          },
        };
      });

      const result = JSON.stringify({ query: normalized, topMatches });
      console.log(`[NCDCoverageSearchTool] Output to LLM: ${result.length} chars (~${(result.length / 1024).toFixed(1)}KB) for ${topMatches.length} matches`);
      cache.set(cacheKey, result, TTL.LONG);
      return result;
    } catch (error: any) {
      console.error("[NCDCoverageSearchTool] Error:", error.message);
      if (error.name === "AbortError") {
        return JSON.stringify({ query: normalized, topMatches: [], error: "Search timed out. Please try again with a more specific query." });
      }
      return JSON.stringify({ query: normalized, topMatches: [], error: "Error searching NCD coverage information. Please try again later." });
    }
  }
}
