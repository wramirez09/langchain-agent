import { StructuredTool } from "@langchain/core/tools";
import { cache, TTL } from "@/lib/cache";
import {
  MedicareSearchInputSchema,
  MedicareSearchInput,
  MedicareScoredResult,
  normalizeInput,
} from "./utils/medicareSearchTypes";
import { scoreMedicareNCD } from "./utils/scoreMedicareDocument";

const RAW_DATA_CACHE_KEY = "cms-ncd-raw-data";

export class NCDCoverageSearchTool extends StructuredTool<typeof MedicareSearchInputSchema> {
  name = "ncd_coverage_search";
  schema = MedicareSearchInputSchema;
  description =
    "Searches National Coverage Determinations (NCDs) for Medicare coverage policies. " +
    "Uses deterministic scoring to rank NCDs by relevance. " +
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

    const CMS_NCD_API_URL =
      "https://api.coverage.cms.gov/v1/reports/national-coverage-ncd/";
    const CMS_NCD_BASE_HTML_URL =
      "https://www.cms.gov/medicare-coverage-database/view/ncd.aspx";

    const cacheKey = `ncd-search:${JSON.stringify(normalized)}`;
    const cachedResult: string | null = cache.get(cacheKey);
    if (cachedResult) {
      console.log(`[NCDCoverageSearchTool] Cache hit for query: "${normalized.query}"`);
      return cachedResult;
    }

    console.log(`[NCDCoverageSearchTool] Searching NCDs:`, JSON.stringify(normalized));

    const controller = new AbortController();
    const { signal } = controller;
    const eventTarget = signal as unknown as EventTarget & { setMaxListeners?: (n: number) => void };
    if (eventTarget.setMaxListeners) eventTarget.setMaxListeners(100);
    const timeout = setTimeout(() => { if (!signal.aborted) controller.abort(); }, 30000);

    try {
      let responseData: any = cache.get(RAW_DATA_CACHE_KEY);

      if (responseData) {
        clearTimeout(timeout);
        console.log(`[NCDCoverageSearchTool] Raw data cache hit (${responseData.data?.length ?? 0} records)`);
      } else {
        console.log("[NCDCoverageSearchTool] Fetching NCD list from CMS API...");
        const fetchStart = Date.now();
        const response = await fetch(CMS_NCD_API_URL, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal,
        });
        clearTimeout(timeout);
        console.log(`[NCDCoverageSearchTool] CMS fetch: ${Date.now() - fetchStart}ms`);

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const parseStart = Date.now();
        responseData = await response.json();
        const rawSize = JSON.stringify(responseData).length;
        console.log(`[NCDCoverageSearchTool] JSON parse: ${Date.now() - parseStart}ms, ${responseData?.data?.length ?? 0} records, ${(rawSize / 1024).toFixed(1)}KB`);
        cache.set(RAW_DATA_CACHE_KEY, responseData, TTL.LONG);
      }

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

      const scoreStart = Date.now();
      const scored = allNCDs
        .map((ncd) => { const { score, matchedOn } = scoreMedicareNCD(ncd, input); return { ncd, score, matchedOn }; })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);
      console.log(`[NCDCoverageSearchTool] Scored ${allNCDs.length} records: ${Date.now() - scoreStart}ms → ${scored.length} matches`);

      if (scored.length === 0) {
        return JSON.stringify({
          query: normalized,
          topMatches: [],
          message: `No NCD found for '${normalized.query}'. Try a simpler phrase, a keyword from the NCD title, or the NCD number (e.g., "220.3").`,
        });
      }

      const top = scored.slice(0, normalized.maxResults);
      const topMatches: MedicareScoredResult[] = top.map(({ ncd, score, matchedOn }) => {
        const { document_id: documentId, document_version: documentVersion, document_display_id: documentDisplayId, title, document_status: status, last_updated: lastUpdated } = ncd;
        const url = documentId != null && documentVersion != null
          ? `${CMS_NCD_BASE_HTML_URL}?ncdid=${documentId}&ncdver=${documentVersion}`
          : undefined;
        return {
          id: `${documentId}-${documentVersion}`,
          title: title || "N/A",
          displayId: documentDisplayId || undefined,
          documentId: documentId != null ? String(documentId) : undefined,
          documentVersion: typeof documentVersion === "number"
            ? documentVersion
            : documentVersion != null ? Number(documentVersion) : undefined,
          score,
          url,
          matchedOn,
          metadata: { status: status || undefined, lastUpdated: lastUpdated || undefined },
        };
      });

      const result = JSON.stringify({ query: normalized, topMatches }, null, 2);
      console.log(`[NCDCoverageSearchTool] Output to LLM: ${result.length} chars (~${(result.length / 1024).toFixed(1)}KB) for ${topMatches.length} matches`);
      cache.set(cacheKey, result, TTL.LONG);
      return result;
    } catch (error: any) {
      clearTimeout(timeout);
      console.error("[NCDCoverageSearchTool] Error:", error.message);
      if (error.name === "AbortError") {
        return JSON.stringify({ query: normalized, topMatches: [], error: "Search timed out. Please try again with a more specific query." });
      }
      return JSON.stringify({ query: normalized, topMatches: [], error: "Error searching NCD coverage information. Please try again later." });
    }
  }
}
