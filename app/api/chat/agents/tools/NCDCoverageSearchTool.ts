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

  private CMS_NCD_API_URL = "https://api.coverage.cms.gov/v1/reports/national-coverage-ncd/";
  private CMS_NCD_BASE_HTML_URL = "https://api.coverage.cms.gov/v1/data/";

  // Internal method for processing the query
  protected async _call(input: string): Promise<string> {
    console.log(`[NCDCoverageSearchTool] Starting search for query: "${input}"`);

    if (!input) {
      console.error('[NCDCoverageSearchTool] Error: Empty query provided');
      return "Input is missing. Please provide a query.";
    }

    const cacheKey = `ncd-search:${input.toLowerCase().trim()}`;
    console.log(`[NCDCoverageSearchTool] Generated cache key: ${cacheKey}`);

    try {
      const cachedResult: string | null = await cache.get(cacheKey);
      if (cachedResult) {
        console.log(`[NCDCoverageSearchTool] Cache hit for query: "${input}"`);
        return cachedResult;
      }
      console.log(`[NCDCoverageSearchTool] Cache miss for query: "${input}"`);

      const controller = new AbortController();
      const signal = controller.signal;

      // Set up timeout
      const timeout = 30000; // 30 seconds
      console.log(`[NCDCoverageSearchTool] Setting request timeout to ${timeout}ms`);

      const timeoutId = setTimeout(() => {
        if (!signal.aborted) {
          console.warn(`[NCDCoverageSearchTool] Request timeout for query: "${input}"`);
          controller.abort();
        }
      }, timeout);

      try {
        console.log(`[NCDCoverageSearchTool] Fetching NCDs from: ${this.CMS_NCD_API_URL}`);
        const response = await fetch(this.CMS_NCD_API_URL, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal,
        });

        clearTimeout(timeoutId);
        console.log(`[NCDCoverageSearchTool] Received response with status: ${response.status}`);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[NCDCoverageSearchTool] API Error (${response.status}): ${errorText}`);
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const responseData = await response.json();
        console.log(`[NCDCoverageSearchTool] Received ${responseData?.data?.length || 0} NCDs from API`);

        // Check if response has the expected structure
        if (!responseData || !responseData.meta || !Array.isArray(responseData.data)) {
          console.error('[NCDCoverageSearchTool] Unexpected API response structure:', responseData);
          return `Error: Unexpected API response format while searching for '${input}'. Please try again later.`;
        }

        // Check for API errors in meta status
        if (responseData.meta.status && responseData.meta.status.id >= 400) {
          console.error('[NCDCoverageSearchTool] API returned error status:', responseData.meta);
          return `Error from CMS API: ${responseData.meta.status.message || 'Unknown error'}`;
        }

        const allNCDs = responseData.data;
        if (allNCDs.length === 0) {
          console.log(`[NCDCoverageSearchTool] No NCDs found in API response`);
          return `No National Coverage Determinations found for '${input}'.`;
        }

        // Filter NCDs based on the query
        const queryLower = input.toLowerCase().replace(/\s*\(.*?\)\s*/g, "");
        console.log(`[NCDCoverageSearchTool] Filtering NCDs for query: "${queryLower}"`);

        const relevantNCDs = allNCDs.filter((ncd: any) => {
          const titleLower = (ncd.title || "").toLowerCase().trim();
          const documentDisplayIdLower = (ncd.document_display_id || "").toLowerCase();

          const matches = titleLower.includes(queryLower) ||
            documentDisplayIdLower.includes(queryLower);

          if (matches) {
            console.log(`[NCDCoverageSearchTool] Match found - Title: "${ncd.title}", ID: ${ncd.document_display_id}`);
          }

          return matches;
        });

        console.log(`[NCDCoverageSearchTool] Found ${relevantNCDs.length} relevant NCDs`);

        if (relevantNCDs.length === 0) {
          console.log(`[NCDCoverageSearchTool] No matching NCDs found for query: "${input}"`);
          return `No National Coverage Determination (NCD) found for '${input}'.`;
        }

        // Format the output for the top 5 results
        const outputResults: string[] = [];
        const resultCount = Math.min(relevantNCDs.length, 5);
        console.log(`[NCDCoverageSearchTool] Formatting top ${resultCount} results`);

        for (let i = 0; i < resultCount; i++) {
          const ncd = relevantNCDs[i];
          const {
            document_id: documentId,
            document_version: documentVersion,
            document_display_id: documentDisplayId,
            title,
            document_status: status,
            last_updated: lastUpdated,
            url
          } = ncd;

          // Format URL for policy content extractor
          const fullHtmlUrl = url ||
            (documentId && documentVersion
              ? `https://www.cms.gov/medicare/coverage/determinationprocess/ncd?ncdid=${documentId}&ncdver=${documentVersion}`
              : "");

          outputResults.push(
            `- Title: ${title || 'N/A'}\n` +
            `  ID: ${documentDisplayId || 'N/A'}\n` +
            `  Status: ${status || 'N/A'}\n` +
            `  Last Updated: ${lastUpdated || 'N/A'}\n` +
            (fullHtmlUrl ? `  URL: ${fullHtmlUrl}\n` : '') +
            (fullHtmlUrl ? `  [POLICY_URL:${fullHtmlUrl}]` : '')
          );
        }

        // Add comprehensive guidance for accessing NCD information
        const guidance = `\n\nTo access the complete NCD details, please follow these steps:\n` +
          `1. **Access the CMS NCD Database**:\n           - Go to: https://www.cms.gov/medicare-coverage-database/view/ncd.aspx?ncdid=${relevantNCDs[0].document_id}\n           - This is the official CMS database for NCD ${relevantNCDs[0].document_display_id}\n\n` +
          `2. **For specific coverage details**:\n           - Review the complete NCD document\n           - Check the "Decision Memo" section for detailed coverage criteria\n           - Look for any applicable coding and billing requirements\n\n` +
          `3. **Contact Information**:\n           - CMS Medicare Coverage Hotline: 1-800-MEDICARE (1-800-633-4227)\n           - TTY users: 1-877-486-2048\n           - Online: https://www.cms.gov/Medicare/Coverage/DeterminationProcess/Contact_Us`;

        // Add troubleshooting guidance
        const troubleshooting = `\n\n**If you encounter issues accessing the NCD**:\n` +
          `1. **Clear your browser cache** and try accessing the link again\n` +
          `2. **Try a different web browser** (Chrome, Firefox, or Edge)\n` +
          `3. **Contact your local MAC** for assistance with specific coverage questions\n` +
          `4. **Document all communications** for your records`;

        const result = `Found ${relevantNCDs.length} National Coverage Determination(s) for '${input}'. ` +
          `Displaying top ${resultCount}:\n` + outputResults.join("\n") + guidance + troubleshooting;

        // Cache the result with TTL
        console.log(`[NCDCoverageSearchTool] Caching results for query: "${input}"`);
        await cache.set(cacheKey, result, CACHE_TTL);
        console.log(`[NCDCoverageSearchTool] Successfully cached results for query: "${input}"`);

        return result;
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          console.error(`[NCDCoverageSearchTool] Request aborted for query: "${input}"`);
          return `The search for '${input}' timed out. Please try again with a more specific query.`;
        }
        console.error(`[NCDCoverageSearchTool] Error processing query "${input}":`, error);
        return `Error searching for coverage information. Please try again later.`;
      }
    } catch (error) {
      console.error(`[NCDCoverageSearchTool] Unexpected error for query "${input}":`, error);
      return `An unexpected error occurred while processing your request. Please try again later.`;
    } finally {
      console.log(`[NCDCoverageSearchTool] Completed processing for query: "${input}"`);
    }
  }
}
