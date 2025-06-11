// policyContentExtractorTool.ts
import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import * as cheerio from "cheerio"; // For HTML parsing: npm install cheerio

// Input schema for the content extractor tool
const PolicyContentExtractorInputSchema = z.object({
  policyUrl: z
    .string()
    .url()
    .describe(
      "The full URL of the Medicare policy document (NCD, LCD, or Article) to extract content from.",
    ),
  // queryContext: z.string().optional().describe("Optional: The original user query context to guide content extraction (e.g., 'prior authorization for diabetes treatment')."),
});

// Interface for the structured details you *aim* to extract from the policy text.
// This is what you would ideally want the LLM to return *after* it processes the raw content.
// For this tool's _call method, we'll return a string representing the extracted content.
export interface ExtractedPolicyDetails {
  priorAuthRequired: "YES" | "NO" | "CONDITIONAL" | "UNKNOWN";
  medicalNecessityCriteria: string[];
  icd10Codes: { code: string; description: string; context: string }[]; // context: e.g., 'covered', 'excluded'
  cptCodes: { code: string; description: string; context: string }[];
  requiredDocumentation: string[];
  limitationsExclusions: string[];
  summary: string;
}

class PolicyContentExtractorTool extends StructuredTool<
  typeof PolicyContentExtractorInputSchema
> {
  name = "policy_content_extractor";
  description =
    "Fetches the full content of a Medicare policy document (NCD, LCD, or Article) from its URL. " +
    "Returns the main textual content of the page for detailed analysis by the AI. Return  A definitive statement (YES, NO, CONDITIONAL, UNKNOWN) for the specific treatment and diagnosis" +
    "A clear, bulleted list of all clinical conditions, patient characteristics, or prior treatments required for coverage" +
    "A precise, actionable checklist of specific medical records, test results, and physician notes needed for submission" +
    "CD-10 Diagnosis Codes: A list of codes and their descriptions that are covered for the specified diagnosis" +
    "CPT/HCPCS Procedure Codes: A list of codes and their descriptions for the requested treatment/service" +
    "Explicitly note any codes specified as non-covered or excluded." +
    "Any specific situations, patient groups, or circumstances where the treatment is not covered or has restrictions." +
    "A brief, overarching explanation of the policy's stance on the treatment." +
    "This content can then be used to identify prior authorization requirements, medical necessity criteria, " +
    "associated ICD-10 and CPT codes, required documentation, and limitations.";
  schema = PolicyContentExtractorInputSchema;

  /**
   * The core logic of the tool.
   * Fetches the HTML, extracts the main text, and returns it.
   * @param input The validated input from the LLM, matching PolicyContentExtractorInputSchema.
   * @returns A string containing the extracted policy text or an error message.
   */
  protected async _call(
    input: z.infer<typeof PolicyContentExtractorInputSchema>,
  ): Promise<string> {
    const { policyUrl } = input;

    console.log(`PolicyContentExtractorTool called with URL: ${policyUrl}`);

    try {
      const response = await fetch(policyUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch policy content from ${policyUrl}: ${response.status} ${response.statusText}`,
        );
      }
      const htmlContent = await response.text();

      // Use cheerio to parse the HTML and extract the main textual content.
      // This is a crucial step as CMS pages have lots of navigation, headers, footers.
      const $ = cheerio.load(htmlContent);

      // Attempt to find the main content block.
      // These selectors are common but may need adjustment if CMS changes its HTML structure.
      let mainContentElement = $(
        "div#ncdContent, div#lcdContent, div#articleContent, div.MCD_MainText, div.CMS_FullText",
      ).first();

      // Fallback if specific content divs are not found: look for common article body tags
      if (mainContentElement.text().trim().length < 100) {
        // If initial extraction is too short, try broader search
        mainContentElement = $("article, main, body").first();
      }

      // Extract text and clean it up
      let extractedText = mainContentElement.text() || $("body").text(); // Fallback to entire body if still nothing
      extractedText = extractedText.replace(/\s+/g, " ").trim(); // Replace multiple spaces/newlines with single space

      if (extractedText.length < 100) {
        console.warn(
          `Extracted content too short for ${policyUrl}. Returning raw HTML content indication.`,
        );
        return `Could not extract substantial content from ${policyUrl}. HTML structure might have changed or content is minimal. Please review the URL directly.`;
      }

      // Return the extracted text. The LLM will then read and interpret this.
      return `Content from ${policyUrl}:\n\n${extractedText}`;
    } catch (error: any) {
      console.error("Error in PolicyContentExtractorTool:", error);
      return `An error occurred while extracting policy content from ${policyUrl}: ${error.message}`;
    }
  }
}

// Instantiate and export the tool.
export const policyContentExtractorTool = new PolicyContentExtractorTool();
