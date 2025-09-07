// policyContentExtractorTool.ts
import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import * as cheerio from "cheerio";
import { llmSummarizer } from "@/lib/llm";
import { StructuredOutputParser } from "langchain/output_parsers";

// ----------------------
// Types & Schemas
// ----------------------

export interface ExtractedPolicyDetails {
  priorAuthRequired: "YES" | "NO" | "CONDITIONAL" | "UNKNOWN";
  medicalNecessityCriteria: string[];
  icd10Codes: { code: string; description: string; context: string }[];
  cptCodes: { code: string; description: string; context: string }[];
  requiredDocumentation: string[];
  limitationsExclusions: string[];
  summary: string;
}

const policyExtractionSchema = z.object({
  priorAuthRequired: z.enum(["YES", "NO", "CONDITIONAL", "UNKNOWN"]),
  medicalNecessityCriteria: z.array(z.string()),
  icd10Codes: z.array(
    z.object({
      code: z.string(),
      description: z.string(),
      context: z.string(),
    }),
  ),
  cptCodes: z.array(
    z.object({
      code: z.string(),
      description: z.string(),
      context: z.string(),
    }),
  ),
  requiredDocumentation: z.array(z.string()),
  limitationsExclusions: z.array(z.string()),
  summary: z.string(),
});

const parser = StructuredOutputParser.fromZodSchema(policyExtractionSchema);

// Tool input schema: only needs a URL
const toolInputSchema = z.object({
  policyUrl: z.string().url(),
});

// ----------------------
// Extraction Logic
// ----------------------

export async function getStructuredPolicyDetails(
  content: string,
): Promise<ExtractedPolicyDetails | null> {

  const prompt = `
You are an expert in healthcare policy extraction. 
Extract the following information from the policy text and return valid JSON.

Policy Text:
${content}

${parser.getFormatInstructions()}
`;

  try {
    const response = await llmSummarizer.invoke([{ role: "user", content: prompt }]);
    const rawText = response.content?.toString() ?? "";
    return await parser.parse(rawText);
  } catch (error) {
    console.error("Error extracting policy details:", error);
    return null;
  }
}

// ----------------------
// Tool Implementation
// ----------------------

class PolicyContentExtractorTool extends StructuredTool<
  z.infer<typeof toolInputSchema>
> {
  name = "policy_content_extractor";
  description =
    "Fetches the full content of a Medicare policy document (NCD, LCD, or Article) from its URL and returns a structured JSON object. The object contains specific details like medical necessity criteria, ICD-10 and CPT codes, required documentation, and limitations. This tool is designed to provide a machine-readable summary for AI analysis.";
  schema = toolInputSchema as any;

  public async _call(input: z.infer<typeof toolInputSchema>): Promise<string> {
    const { policyUrl } = input;
    console.log(`Fetching and extracting content from: ${policyUrl}`);

    // Set up abort controller with max listeners
    const controller = new AbortController();
    const signal = controller.signal;

    // Type assertion to access EventTarget methods
    const eventTarget = signal as unknown as EventTarget & { setMaxListeners?: (n: number) => void };
    if (eventTarget.setMaxListeners) {
      eventTarget.setMaxListeners(1500);
    }

    const timeout = setTimeout(() => {
      if (!signal.aborted) {
        controller.abort();
      }
    }, 30000);

    try {
      const response = await fetch(policyUrl, { signal });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch policy content from ${policyUrl}: ${response.status} ${response.statusText}`,
        );
      }

      // Clear the timeout if the request succeeds
      clearTimeout(timeout);
      const htmlContent = await response.text();
      const $ = cheerio.load(htmlContent);

      let extractedText = "";
      const selectors =
        "div.document-view-section, .article-content, .coverage-summary";
      const elements = $(selectors);

      if (elements.length > 0) {
        extractedText = elements
          .map((_, el) => $(el).text().trim())
          .get()
          .join("\n\n");
      } else {
        extractedText = $("body").text().trim();
      }

      extractedText = extractedText.replace(/\s+/g, " ").trim();

      if (extractedText.length < 100) {
        const warning = `Extracted content too short for ${policyUrl}.`;
        console.warn(warning);
        return JSON.stringify({
          error: warning,
          details:
            "HTML structure might have changed or content is minimal. Please review the URL directly.",
        });
      }

      const structuredDetails = await getStructuredPolicyDetails(extractedText);
      if (structuredDetails) {
        return JSON.stringify({
          policyUrl,
          ...structuredDetails,
        });
      } else {
        const errorMsg = `An error occurred during structured extraction from ${policyUrl}.`;
        console.error(errorMsg);
        return JSON.stringify({
          error: errorMsg,
          details:
            "The LLM failed to parse the content into the expected JSON format.",
        });
      }
    } catch (error: any) {
      console.error("Error in PolicyContentExtractorTool:", error);
      return JSON.stringify({
        error: `An error occurred while extracting policy content from ${policyUrl}`,
        details: error.message,
      });
    }
  }
}

// Instantiate and export
export const policyContentExtractorTool = new PolicyContentExtractorTool();
