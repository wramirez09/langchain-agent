import { StructuredTool } from "@langchain/core/tools";
import { cache } from "@/lib/cache";
import {
  MedicareSearchInputSchema,
  MedicareSearchInput,
  MedicareScoredResult,
  normalizeInput,
} from "./utils/medicareSearchTypes";
import { scoreMedicareNCD } from "./utils/scoreMedicareDocument";


// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;


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
    "**Output:** Returns structured JSON with topMatches array. Each match includes title, displayId, score, matchedOn signals, and URL.";

  async _call(input: MedicareSearchInput): Promise<string> {
    const normalized = normalizeInput(input);
    // Record tool usage


    const CMS_NCD_API_URL =
      "https://api.coverage.cms.gov/v1/reports/national-coverage-ncd/";
    const CMS_NCD_BASE_HTML_URL =
      "https://www.cms.gov/medicare-coverage-database/view/ncd.aspx";

    const cacheKey = `ncd-search:${JSON.stringify(normalized)}`;
    const cachedResult: string | null = await cache.get(cacheKey);

    if (cachedResult) {
      console.log(
        `[NCDCoverageSearchTool] Cache hit for query: "${normalized.query}"`
      );
      return cachedResult;
    }

    console.log(
      `[NCDCoverageSearchTool] Searching NCDs with input:`,
      JSON.stringify(normalized, null, 2)
    );

    const controller = new AbortController();
    const { signal } = controller;

    // Increase max listeners & ensure cleanup
    const eventTarget = signal as unknown as EventTarget & {
      setMaxListeners?: (n: number) => void;
    };
    if (eventTarget.setMaxListeners) {
      eventTarget.setMaxListeners(100);
    }

    const timeout = setTimeout(() => {
      if (!signal.aborted) controller.abort();
    }, 30000);

    try {
      console.log(
        "[NCDCoverageSearchTool] Fetching NCD list from CMS Coverage API..."
      );

      const response = await fetch(CMS_NCD_API_URL, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseData = await response.json();

      // Validate API shape
      if (!responseData || !responseData.meta || !Array.isArray(responseData.data)) {
        console.error("Unexpected API response structure:", responseData);
        return JSON.stringify({
          query: normalized,
          topMatches: [],
          error: "Unexpected CMS API response format. Please try again later."
        });
      }

      if (responseData.meta.status && responseData.meta.status.id >= 400) {
        console.error("CMS API meta status error:", responseData.meta);
        return JSON.stringify({
          query: normalized,
          topMatches: [],
          error: `CMS Coverage API error: ${responseData.meta.status.message || "Unknown error"}`
        });
      }

      const allNCDs: any[] = responseData.data || [];
      if (allNCDs.length === 0) {
        return JSON.stringify({
          query: normalized,
          topMatches: [],
          message: "No National Coverage Determinations (NCDs) are currently available from CMS."
        });
      }

      const scored = allNCDs
        .map((ncd) => {
          const { score, matchedOn } = scoreMedicareNCD(ncd, input);
          return { ncd, score, matchedOn };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);

      console.log(
        `[NCDCoverageSearchTool] ${scored.length} scored matches for query "${normalized.query}"`
      );

      if (scored.length === 0) {
        return JSON.stringify({
          query: normalized,
          topMatches: [],
          message: `No National Coverage Determination (NCD) found for '${normalized.query}'. Try using a simpler phrase, a key word from the NCD title, or the NCD number (e.g., "220.3").`
        });
      }

      const top = scored.slice(0, normalized.maxResults);
      const topMatches: MedicareScoredResult[] = top.map(({ ncd, score, matchedOn }) => {
        const {
          document_id: documentId,
          document_version: documentVersion,
          document_display_id: documentDisplayId,
          title,
          document_status: status,
          last_updated: lastUpdated,
        } = ncd;

        let fullHtmlUrl = "";
        if (documentId != null && documentVersion != null) {
          fullHtmlUrl = `${CMS_NCD_BASE_HTML_URL}?ncdid=${documentId}&ncdver=${documentVersion}`;
        }

        return {
          id: `${documentId}-${documentVersion}`,
          title: title || "N/A",
          displayId: documentDisplayId || undefined,
          score,
          url: fullHtmlUrl || undefined,
          matchedOn,
          metadata: {
            status: status || undefined,
            lastUpdated: lastUpdated || undefined,
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
        `[NCDCoverageSearchTool] Returning ${topMatches.length} results with scores:`,
        topMatches.map(m => ({ title: m.title, score: m.score, matchedOn: m.matchedOn }))
      );

      await cache.set(cacheKey, result, CACHE_TTL);

      return result;
    } catch (error: any) {
      console.error("[NCDCoverageSearchTool] Error in NCD coverage search:", error);
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
        error: "Error searching for NCD coverage information. Please try again later."
      });
    }
  }
}
