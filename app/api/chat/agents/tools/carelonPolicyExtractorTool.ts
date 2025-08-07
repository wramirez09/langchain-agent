import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import * as cheerio from "cheerio";
import { toast } from "sonner";

const PolicyContentExtractorInputSchema = z.object({
  policyUrl: z.string().url().describe("Carelon guideline url"),
});

export interface ExtractedPolicyDetails {
  priorAuthRequired: "YES" | "NO" | "CONDITIONAL" | "UNKNOWN";
  medicalNecessityCriteria: string[];
  icd10Codes: { code: string; description: string; context: string }[];
  cptCodes: { code: string; description: string; context: string }[];
  requiredDocumentation: string[];
  limitationsExclusions: string[];
  summary: string;
}

class CarelonContentExtractorTool extends StructuredTool<
  typeof PolicyContentExtractorInputSchema
> {
  name = "carelon_content_extractor";
  description = "Carelon content extraction tool";
  schema = PolicyContentExtractorInputSchema;

  public async _call(
    input: z.infer<typeof PolicyContentExtractorInputSchema>,
  ): Promise<string> {
    const { policyUrl } = input;
    toast("getting data from carelon");
    try {
      const response = await fetch(policyUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch policy content from ${policyUrl}: ${response.status} ${response.statusText}`,
        );
      }

      const htmlContent = await response.text();
      const $ = cheerio.load(htmlContent);

      // Attempt to find the main content block.
      // These selectors are common but may need adjustment if CMS changes its HTML structure.
      let mainContentElement = $("pre").first();

      // Fallback if specific content divs are not found: look for common article body tags
      if (mainContentElement.text().trim().length < 100) {
        // If initial extraction is too short, try broader search
        mainContentElement = $("article, main, body").first();
      }

      // Extract text and clean it up
      let extractedText = mainContentElement.text() || $("body").text(); // Fallback to entire body if still nothing
      extractedText = extractedText.replace(/\s+/g, " ").trim(); // Replace multiple spaces/newlines with single space
      console.log({ extractedText });

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
export const CarelonContentExtractor = new CarelonContentExtractorTool();
