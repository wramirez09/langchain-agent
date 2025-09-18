// policyContentExtractorTool.ts
import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import * as cheerio from "cheerio";
import { llmSummarizer } from "@/lib/llm";

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

// Tool input schema: only needs a URL
const toolInputSchema = z.object({
  policyUrl: z.string().url(),
});

// Helper function to process policy content before sending to LLM
function processPolicyContent(content: string): string {
  try {
    // Basic HTML cleaning if needed
    const $ = cheerio.load(content);
    // Remove script and style elements
    $('script, style, nav, footer, header, iframe').remove();
    // Get text content
    let text = $('body').text();
    // Clean up whitespace
    text = text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
    // Truncate to avoid token limits (adjust as needed)
    return text.substring(0, 10000);
  } catch (error) {
    return content; // Return original content if processing fails
  }
}

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

${policyExtractionSchema.shape}
`;

  try {
    const response = await llmSummarizer.invoke([{ role: "user", content: prompt }]);
    const rawText = response.content?.toString() ?? "";
    return policyExtractionSchema.parse(rawText);
  } catch (error) {
    return null;
  }
}

// ----------------------
// Tool Implementation
// ----------------------

export class PolicyContentExtractorTool extends StructuredTool<
  z.infer<typeof toolInputSchema>
> {
  name = "policy_content_extractor";
  description =
    "Fetches the full content of a Medicare policy document (NCD, LCD, or Article) from its URL and returns a structured JSON object. The object contains specific details like medical necessity criteria, ICD-10 and CPT codes, required documentation, and limitations. This tool is designed to provide a machine-readable summary for AI analysis.";
  schema = toolInputSchema as any;

  async _call(input: z.infer<typeof toolInputSchema>) {
    try {
      const response = await fetch(input.policyUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch policy content: ${response.status} ${response.statusText}`);
      }

      const content = await response.text();
      const processedContent = processPolicyContent(content);

      const llmResponse = await llmSummarizer.invoke(`Extract policy details: ${processedContent}`);
      const rawText = llmResponse?.content?.toString() || '';

      try {
        let jsonStr = rawText;
        const jsonMatch = rawText.match(/```(?:json)?\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1]) {
          jsonStr = jsonMatch[1];
        }

        const parsed = policyExtractionSchema.parse(JSON.parse(jsonStr));
        return JSON.stringify(parsed);
      } catch (error) {
        throw new Error(`Failed to parse policy data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } catch (error) {
      throw error; // Re-throw to be handled by the agent
    }
  }
}

// Instantiate and export
export const policyContentExtractorTool = new PolicyContentExtractorTool();
