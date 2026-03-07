// localLcdSearchTool.ts
import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { llmSummarizer } from "@/lib/llm";
import * as cheerio from "cheerio";
import { cache } from "@/lib/cache";

const LCD_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Input schema for the LCD search tool
const LocalLcdSearchInputSchema = z.object({
  query: z
    .string()
    .describe(
      "The disease or treatment query to search for in Local Coverage Determinations (LCDs).",
    ),
  state: z
    .object({ state_id: z.number(), description: z.string() })
    .describe(
      "The id of the state (e.g., 'Illinois', 'California') to filter LCDs. and description of the state as the corresponding state name.",
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

  private async fetchAndSummarizeLcd(url: string, query: string): Promise<string> {
    try {
      const response = await fetch(url);
      const html = await response.text();

      const $ = cheerio.load(html);
      $("script, style, nav, footer, header, iframe, noscript").remove();
      const plainText = $("body").text().replace(/\s+/g, " ").trim().substring(0, 12000);

      const messages = [
        { type: "system" as const, content: "You are an expert healthcare policy analyst. Extract structured clinical coverage information from Medicare LCD/NCD documents with high fidelity. Preserve specific codes, document IDs, and clinical criteria verbatim — do not paraphrase or generalize." },
        {
          type: "human" as const, content: `Analyze this Medicare coverage document as it relates to: "${query}"\n\nExtract and preserve the following with specificity:\n1. **Medical necessity criteria** — list each specific clinical condition, symptom, or finding required for coverage (verbatim where possible)\n2. **ICD-10 codes** — list every specific code and description mentioned (e.g., G25.0 Essential tremor, M54.16 Radiculopathy lumbar region)\n3. **CPT/HCPCS codes** — list every code or code range mentioned, grouped by anatomical region where applicable (e.g., Brain: 70551–70553, Spine: 72141–72158)\n4. **Required documentation** — list each specific documentation item required for coverage\n5. **Limitations and exclusions** — list each non-covered scenario or restriction verbatim\n6. **Referenced document IDs** — note any LCD or NCD IDs referenced within the document (e.g., LCD L37373, NCD 220.2)\n\nIf a section is not present in the document, state "Not specified in document."\n\nDocument content:\n${plainText}`
        }
      ];

      const summary = await llmSummarizer().invoke(messages);
      return summary.content as string;
    } catch (error: unknown) {
      console.error("Error fetching and summarizing LCD:", error);
      return "[Failed to summarize]";
    }
  }

  protected async _call(input: z.infer<typeof LocalLcdSearchInputSchema>): Promise<string> {
    const cacheKey = JSON.stringify(input);
    const cached = cache.get<string>(cacheKey);
    if (cached) {
      console.log("LocalLcdSearchTool: Cache hit!");
      return cached;
    }
    const { query, state } = input;

    try {
      // 1. Get the two-letter state ID from the full state name.
      if (!state || !state.state_id) {
        return `Error: Could not find a valid state ID for '${state.description}'. Please provide a full, valid U.S. state name.`;
      }

      // 2. Fetch Local Coverage Determinations for the specific state.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const lcdsResponse = await fetch(
        `${this.CMS_LOCAL_LCDS_API_URL}?state_id=${state.state_id}&status=A`,
        {
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

      if (!lcdsResponse.ok) {
        throw new Error(
          `Failed to fetch local LCDs for ${state}: ${lcdsResponse.status} ${lcdsResponse.statusText}`,
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

      const lcds = allLcds.data.filter((lcd) => {
        const titleLower = (lcd.title || "").toLowerCase();
        return (p1 && titleLower.includes(p1)) || (p2 && titleLower.includes(p2));
      });

      // 4. Handle cases where no relevant LCDs are found.
      if (lcds.length === 0) {
        return `No Local Coverage Determination (LCD) found for '${query}' in ${state}.`;
      }

      // 5. Format the output to be returned to the LLM.
      const maxResults = Math.min(lcds.length, 3);
      const topLcds = lcds.slice(0, maxResults);

      // Fetch and summarize all LCDs in parallel instead of sequentially
      const outputResults = await Promise.all(
        topLcds.map(async (lcd) => {
          const fullHtmlUrl = lcd.url ? lcd.url : "URL N/A";
          const summary = lcd.url
            ? await this.fetchAndSummarizeLcd(lcd.url, query)
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

      const result = `Found ${lcds.length} Local Coverage Determination(s) for '${query}' in ${state}. ` +
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
