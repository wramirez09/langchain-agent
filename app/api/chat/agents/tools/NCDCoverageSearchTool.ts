import { Tool } from "@langchain/core/tools";
import { cache } from "@/lib/cache";


// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

// ----------------- Similarity Helpers -----------------
function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}\s.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(str: string): string[] {
  return normalizeText(str)
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function computeRelevanceScore(query: string, ncd: any): number {
  // Remove parenthetical notes to focus on core terms
  const queryNoParens = query.replace(/\s*\(.*?\)\s*/g, "");
  const normQuery = normalizeText(queryNoParens);
  const queryTokens = tokenize(normQuery);

  const title = ncd.title || "";
  const displayId = ncd.document_display_id || "";

  const normTitle = normalizeText(title);
  const titleTokens = tokenize(normTitle);
  const displayIdLower = String(displayId).toLowerCase();

  let score = 0;

  // Strong boost if query matches the NCD number
  if (normQuery === displayIdLower) {
    score += 4;
  } else if (
    normQuery.includes(displayIdLower) ||
    displayIdLower.includes(normQuery)
  ) {
    score += 2;
  }

  // Boost if the title contains the whole normalized query
  if (normTitle.includes(normQuery) && normQuery.length > 0) {
    score += 2;
  }

  // Token overlap between query and title
  if (queryTokens.length > 0 && titleTokens.length > 0) {
    const titleTokenSet = new Set(titleTokens);
    const matchedTokens = queryTokens.filter((t) => titleTokenSet.has(t));
    if (matchedTokens.length > 0) {
      const coverage = matchedTokens.length / queryTokens.length; // 0–1
      score += coverage; // modest additive score
    }
  }

  // Tiny boost if any query token appears in title at all
  if (
    queryTokens.some((t) => normTitle.includes(t)) &&
    score === 0
  ) {
    score += 0.5;
  }

  return score;
}

// ----------------- Tool Implementation -----------------
export class NCDCoverageSearchTool extends Tool {
  name = "ncd_coverage_search";
  description =
    "Searches National Coverage Determinations (NCDs) for a given disease, treatment, or NCD number. " +
    "Returns title, NCD ID, status, last updated date, and a CMS URL. " +
    "If multiple NCDs are found, it lists up to 10 ordered by relevance.";

  protected async _call(input: string): Promise<string> {
    // Record tool usage


    const CMS_NCD_API_URL =
      "https://api.coverage.cms.gov/v1/reports/national-coverage-ncd/";
    // Human-readable HTML page base (correct pattern uses lowercase ncdid/ncdver)
    const CMS_NCD_BASE_HTML_URL =
      "https://www.cms.gov/medicare-coverage-database/view/ncd.aspx";

    if (!input || !input.trim()) {
      return "Input is missing. Please provide a query such as a disease, treatment, or NCD number (e.g., '220.3').";
    }

    const cleanedQuery = input.trim();
    const cacheKey = `ncd-search:${cleanedQuery.toLowerCase()}`;
    const cachedResult: string | null = await cache.get(cacheKey);

    if (cachedResult) {
      console.log(
        `NCDCoverageSearchTool: Cache hit for query: "${cleanedQuery}"`
      );
      return cachedResult;
    }

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
        "NCDCoverageSearchTool: Fetching NCD list from CMS Coverage API..."
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
        return `Error: Unexpected CMS API response format while searching for '${cleanedQuery}'. Please try again later.`;
      }

      if (responseData.meta.status && responseData.meta.status.id >= 400) {
        console.error("CMS API meta status error:", responseData.meta);
        return `Error from CMS Coverage API: ${responseData.meta.status.message || "Unknown error"
          }`;
      }

      const allNCDs: any[] = responseData.data || [];
      if (allNCDs.length === 0) {
        return `No National Coverage Determinations (NCDs) are currently available from CMS for this search.`;
      }

      // --- Improved similarity search ---
      const scored = allNCDs
        .map((ncd) => ({
          ncd,
          score: computeRelevanceScore(cleanedQuery, ncd),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);

      console.log(
        `NCDCoverageSearchTool: ${scored.length} scored matches for query "${cleanedQuery}".`
      );

      if (scored.length === 0) {
        return (
          `No National Coverage Determination (NCD) found for '${cleanedQuery}'. ` +
          `Try using a simpler phrase, a key word from the NCD title, or the NCD number (for example, "220.3").`
        );
      }

      // Take top 10 most relevant NCDs
      const top = scored.slice(0, 10);
      const outputResults: string[] = [];

      for (const { ncd, score } of top) {
        const {
          document_id: documentId,
          document_version: documentVersion,
          document_display_id: documentDisplayId,
          title,
          document_status: status,
          last_updated: lastUpdated,
        } = ncd;

        // Build *correct* human-viewable URL:
        // https://www.cms.gov/medicare-coverage-database/view/ncd.aspx?ncdid=177&ncdver=6
        let fullHtmlUrl = "";
        if (documentId != null && documentVersion != null) {
          fullHtmlUrl = `${CMS_NCD_BASE_HTML_URL}?ncdid=${documentId}&ncdver=${documentVersion}`;
        }

        outputResults.push(
          `- Title: ${title || "N/A"}\n` +
          `  ID: ${documentDisplayId || "N/A"}\n` +
          `  Status: ${status || "N/A"}\n` +
          `  Last Updated: ${lastUpdated || "N/A"}\n` +
          `  Relevance Score: ${score.toFixed(2)}\n` +
          (fullHtmlUrl ? `  URL: ${fullHtmlUrl}\n` : "") +
          (fullHtmlUrl ? `  [POLICY_URL:${fullHtmlUrl}]` : "")
        );
      }

      const best = top[0].ncd;

      const guidance =
        `\n\nTo view the complete NCD text in the Medicare Coverage Database:\n` +
        `1. Open: ${CMS_NCD_BASE_HTML_URL}?ncdid=${best.document_id}&ncdver=${best.document_version}\n` +
        `2. Review the full policy, including coverage indications, limitations, and any coding details.\n`;

      // const troubleshooting =
      //   `\n\nIf you have trouble accessing the NCD page:\n` +
      //   `- Try a different browser (Chrome, Edge, Firefox)\n` +
      //   `- Ensure pop-up blockers or corporate filters are not blocking cms.gov\n` +
      //   `- You can also search manually at: https://www.cms.gov/medicare-coverage-database\n`;

      const result =
        `Found ${scored.length} potentially relevant National Coverage Determination(s) for '${cleanedQuery}'. ` +
        `Displaying top ${top.length} by relevance:\n\n` +
        outputResults.join("\n") +
        guidance;

      await cache.set(cacheKey, result, CACHE_TTL);

      return result;
    } catch (error: any) {
      console.error("Error in NCD coverage search:", error);
      if (error.name === "AbortError") {
        return `The search for '${input}' timed out. Please try again with a more specific or shorter query.`;
      }
      return `Error searching for NCD coverage information. Please try again later.`;
    }
  }
}
