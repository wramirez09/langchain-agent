import { Tool } from "@langchain/core/tools";
import { cache } from "@/lib/cache";

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

// Implement the tool class
export class NCDCoverageSearchTool extends Tool {
  name = "ncd_coverage_search";
  description =
    "Searches National Coverage Determinations (NCDs) for a given disease or treatment query. " +
    "Returns the title, document display ID, and the direct URL for relevant NCDs. " +
    "If multiple NCDs are found, it lists up to 10.";

  // Internal method for processing the query
  protected async _call(input: string): Promise<string> {
    const CMS_NCD_API_URL =
      "https://api.coverage.cms.gov/v1/reports/national-coverage-ncd/";
    const CMS_NCD_BASE_HTML_URL = "https://api.coverage.cms.gov/v1/data/";

    if (!input) {
      return "Input is missing. Please provide a query.";
    }

    const cacheKey = `ncd-search:${input.toLowerCase().trim()}`;
    const cachedResult: string | null = await cache.get(cacheKey);

    if (cachedResult) {
      console.log(`NCDCoverageSearchTool: Cache hit for query: ${input}`);
      return cachedResult;
    }

    const controller = new AbortController();
    const signal = controller.signal;

    // Increase max listeners and ensure proper cleanup
    const eventTarget = signal as unknown as EventTarget & { setMaxListeners?: (n: number) => void };
    if (eventTarget.setMaxListeners) {
      eventTarget.setMaxListeners(100); // Increased from default 10 to 20
    }

    const timeout = setTimeout(() => {
      if (!signal.aborted) {
        controller.abort();
      }
    }, 30000);

    try {
      console.log("getting NCDs");
      // Fetch all NCDs from the CMS API
      const response = await fetch(CMS_NCD_API_URL, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal, // Use the signal variable instead of controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const allNCDs = await response.json();

      // Filter NCDs based on the query
      const queryLower = input.toLowerCase().replace(/\s*\(.*?\)\s*/g, "");

      const relevantNCDs = allNCDs.data.filter((ncd: any) => {
        const titleLower = (ncd.title || "").toLowerCase().trim();

        const documentDisplayIdLower = (
          ncd.document_display_id || ""
        ).toLowerCase();
        return (
          titleLower.includes(queryLower) ||
          documentDisplayIdLower.includes(queryLower)
        );
      });

      console.log(`${relevantNCDs.length} relvent ncd found`);

      if (relevantNCDs.length === 0) {
        return `No National Coverage Determination (NCD) found for '${input}'.`;
      }

      // Format the output for the top 5 results
      const outputResults: string[] = [];
      for (let i = 0; i < Math.min(relevantNCDs.length, 5); i++) {
        const ncd = relevantNCDs[i];
        const documentId = ncd.document_id;
        const documentVersion = ncd.document_version;
        const documentDisplayId = ncd.document_display_id;
        const title = ncd.title;

        const fullHtmlUrl =
          documentId && documentVersion
            ? `${CMS_NCD_BASE_HTML_URL}ncd?ncdid=${documentId}&ncdver=${documentVersion}`
            : "URL N/A";

        outputResults.push(
          `  - Title: '${title}' (ID: ${documentDisplayId})\n` +
          `    Direct URL for details: ${fullHtmlUrl}`,
        );
      }

      const result = `Found ${relevantNCDs.length} National Coverage Determination(s) for '${input}'. ` +
        `Displaying top ${Math.min(relevantNCDs.length, 10)}:\n` +
        outputResults.join("\n");

      // Cache the result with TTL
      await cache.set(cacheKey, result, CACHE_TTL);

      return result;
    } catch (error: any) {
      return `Error calling CMS API or processing data: ${error.message}`;
    }
  }
}
