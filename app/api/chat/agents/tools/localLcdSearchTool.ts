// localLcdSearchTool.ts
import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { llmSummarizer } from "@/lib/llm";
import * as cheerio from "cheerio";
import { cache } from "@/lib/cache";
import { data as statesData } from "@/app/agents/metaData/states";

const LCD_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Input schema for the LCD search tool
const LocalLcdSearchInputSchema = z.object({
  query: z
    .string()
    .describe(
      "The disease or treatment query to search for in Local Coverage Determinations (LCDs).",
    ),
  state_name: z
    .string()
    .describe(
      "The full U.S. state name exactly as provided by the user (e.g., 'Illinois', 'California - Northern'). Do NOT provide a numeric ID — the tool resolves the ID internally.",
    ),
});


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

class LocalLcdSearchTool extends StructuredTool<
  typeof LocalLcdSearchInputSchema
> {
  name = "local_lcd_search";
  schema = LocalLcdSearchInputSchema;
  description =
    "Searches Local Coverage Determinations (LCDs) for a given disease or treatment query within a specific state. " +
    "LCDs define coverage criteria specific to a Medicare Administrative Contractor (MAC) region and often include detailed medical necessity guidelines. " +
    "Returns the LCD title, display ID, MAC, CPT codes ICD codes and the direct URL for relevant LCDs. " +
    "If multiple LCDs are found, it lists up to 10.";

  private CMS_LOCAL_LCDS_API_URL =
    "https://api.coverage.cms.gov/v1/reports/local-coverage-final-lcds/";

  private async fetchAndSummarizeLcd(
    url: string,
    query: string,
    docId?: string,
    docVer?: string,
    stateId?: number,
  ): Promise<string> {
    // Try CMS JSON API first — returns full structured content including coding tables
    if (docId && docVer) {
      try {
        const apiUrl = `https://api.coverage.cms.gov/v1/lcd/${docId}/${docVer}/${stateId ? `?state_id=${stateId}` : ""}`;
        const apiController = new AbortController();
        const apiTimeout = setTimeout(() => apiController.abort(), 15000);
        const apiResponse = await fetch(apiUrl, { signal: apiController.signal });
        clearTimeout(apiTimeout);

        if (apiResponse.ok) {
          const apiData = await apiResponse.json() as { data?: { content?: string; [key: string]: unknown } };
          const apiHtml = apiData?.data?.content ?? "";
          if (apiHtml && apiHtml.length > 200) {
            const $api = cheerio.load(apiHtml);
            const apiText = $api("body").text().replace(/\s+/g, " ").trim().substring(0, 25000);
            if (apiText.length > 200) {
              return await this.summarizeLcdText(apiText, query);
            }
          }
        }
      } catch (apiErr) {
        console.warn(`CMS API fetch failed for LCD ${docId}/${docVer}, falling back to HTML:`, (apiErr as Error).message);
      }
    }

    // Fall back to HTML scraping
    try {
      const response = await fetch(url);
      const html = await response.text();

      const $ = cheerio.load(html);
      $("script, style, nav, footer, header, iframe, noscript, dialog, [role='dialog'], .modal, .modal-dialog, .modal-content").remove();
      const plainText = $("body").text().replace(/\s+/g, " ").trim().substring(0, 25000);
      return await this.summarizeLcdText(plainText, query);
    } catch (error: unknown) {
      console.error("Error fetching and summarizing LCD:", error);
      return "[Failed to summarize]";
    }
  }

  private async summarizeLcdText(plainText: string, query: string): Promise<string> {
    const messages = [
      { type: "system" as const, content: "You are an expert healthcare policy analyst. Extract structured clinical coverage information from Medicare LCD/NCD documents with high fidelity. Preserve specific codes, document IDs, and clinical criteria verbatim — do not paraphrase or generalize." },
      {
        type: "human" as const,
        content: `Analyze this Medicare coverage document as it relates to: "${query}"\n\nExtract and preserve the following with specificity:\n1. **Medical necessity criteria** — list each specific clinical condition, symptom, or finding required for coverage (verbatim where possible)\n2. **ICD-10 codes** — list every specific code and description mentioned (e.g., G25.0 Essential tremor, M54.16 Radiculopathy lumbar region)\n3. **CPT/HCPCS codes** — list every code or code range mentioned, grouped by anatomical region where applicable (e.g., Brain: 70551–70553, Spine: 72141–72158)\n4. **Required documentation** — list each specific documentation item required for coverage\n5. **Limitations and exclusions** — list each non-covered scenario or restriction verbatim\n6. **Referenced document IDs** — note any LCD or NCD IDs referenced within the document (e.g., LCD L37373, NCD 220.2)\n\nIf a section is not present in the document, state "Not specified in document."\n\nDocument content:\n${plainText}`
      }
    ];
    const summary = await llmSummarizer().invoke(messages);
    return summary.content as string;
  }

  protected async _call(input: z.infer<typeof LocalLcdSearchInputSchema>): Promise<string> {
    const cacheKey = JSON.stringify(input);
    const cached = cache.get<string>(cacheKey);
    if (cached) {
      console.log("LocalLcdSearchTool: Cache hit!");
      return cached;
    }
    const { query, state_name } = input;

    try {
      // 1. Resolve state_name → CMS state_id from the authoritative states list.
      const stateRecord = statesData.find(
        (s) => s.description.toLowerCase() === state_name.toLowerCase()
      );
      if (!stateRecord) {
        return `Error: Could not find a valid state ID for '${state_name}'. Valid state names include: ${statesData.map(s => s.description).join(", ")}`;
      }
      const stateId = stateRecord.state_id;
      console.log(`LocalLcdSearchTool: Resolved '${state_name}' → state_id ${stateId}`);

      // 2. Fetch Local Coverage Determinations for the specific state.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const lcdsResponse = await fetch(
        `${this.CMS_LOCAL_LCDS_API_URL}?state_id=${stateId}&status=A`,
        {
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

      if (!lcdsResponse.ok) {
        throw new Error(
          `Failed to fetch local LCDs for ${state_name} (state_id: ${stateId}): ${lcdsResponse.status} ${lcdsResponse.statusText}`,
        );
      }
      const allLcds: LocalCoverageDetermination = await lcdsResponse.json();

      // 3. Perform client-side filtering based on the query.
      const queryLower = query.toLowerCase();
      const p1 = queryLower.split("(")[0].trim();
      const parenStart = queryLower.indexOf("(");
      const parenEnd = queryLower.indexOf(")");
      const p2 = parenStart !== -1 && parenEnd > parenStart
        ? queryLower.substring(parenStart + 1, parenEnd).trim()
        : "";
      // Token-level fallback: significant words from the query (≥5 chars, not generic)
      const stopWords = new Set(["the", "and", "for", "with", "without", "using", "services"]);
      const queryTokens = (p1 || queryLower)
        .split(/\s+/)
        .filter((t) => t.length >= 4 && !stopWords.has(t));

      const lcds = allLcds.data.filter((lcd) => {
        const titleLower = (lcd.title || "").toLowerCase();
        // Exact phrase match (primary)
        if ((p1 && titleLower.includes(p1)) || (p2 && titleLower.includes(p2))) return true;
        // Token fallback: match if ≥2 query tokens appear in title (or ≥1 if only 1 token)
        const matchedTokens = queryTokens.filter((t) => titleLower.includes(t));
        return queryTokens.length === 1
          ? matchedTokens.length >= 1
          : matchedTokens.length >= 2;
      });

      // 4. Handle cases where no relevant LCDs are found.
      if (lcds.length === 0) {
        return `No Local Coverage Determination (LCD) found for '${query}' in ${state_name} (state_id: ${stateId}).`;
      }

      // 5. Format the output to be returned to the LLM.
      const maxResults = Math.min(lcds.length, 3);
      const topLcds = lcds.slice(0, maxResults);

      // Fetch and summarize all LCDs in parallel instead of sequentially
      const CMS_LCD_BASE_URL = "https://www.cms.gov/medicare-coverage-database/view/lcd.aspx";

      const outputResults = await Promise.all(
        topLcds.map(async (lcd) => {
          const fullHtmlUrl = lcd.document_id
            ? `${CMS_LCD_BASE_URL}?LCDId=${lcd.document_id}&ver=${lcd.document_version}`
            : (lcd.url || "URL N/A");
          const summary = lcd.document_id
            ? await this.fetchAndSummarizeLcd(
                fullHtmlUrl,
                query,
                String(lcd.document_id),
                String(lcd.document_version),
                stateId,
              )
            : "[No URL available for summarization]";
          return (
            `## ${lcd.title} (ID: ${lcd.document_display_id || "N/A"})\n` +
            `- **MAC:** ${lcd.contractor_name_type || "N/A"}\n` +
            `- **Effective Date:** ${lcd.effective_date || "N/A"}\n` +
            `- **Last Updated:** ${lcd.updated_on || "N/A"}\n` +
            `- **Summary:** ${summary}\n` +
            `- **Direct URL:** ${fullHtmlUrl}\n`
          );
        })
      );

      console.log(`${outputResults.length} LCD's found and summarized`);

      const result = `Found ${lcds.length} Local Coverage Determination(s) for '${query}' in ${state_name}. ` +
        `Displaying top ${maxResults} with summaries:\n\n` +
        outputResults.join("\n\n");

      cache.set(cacheKey, result, LCD_CACHE_TTL);
      return result;
    } catch (error: unknown) {
      console.error("Error in LocalLcdSearchTool:", error);
      return `An error occurred while searching for local LCDs: ${(error as Error).message}`;
    }
  }
}

// Instantiate and export the tool.
export const localLcdSearchTool = new LocalLcdSearchTool();
