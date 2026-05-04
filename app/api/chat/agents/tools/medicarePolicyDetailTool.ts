import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { cmsCoverageApiClient } from "./utils/cmsCoverageApiClient";

const inputSchema = z.object({
  documentType: z.enum(["ncd", "lcd", "article"]),
  documentId: z.string().min(1),
  documentVersion: z.number().int().nonnegative(),
});

class MedicarePolicyDetailTool extends StructuredTool<typeof inputSchema> {
  name = "medicare_policy_detail";
  schema = inputSchema;
  description =
    "Fetches structured Medicare policy details (medical necessity criteria, ICD-10/CPT codes, " +
    "documentation requirements, limitations) directly from the CMS Coverage API. " +
    "Use this tool for any CMS-hosted Medicare policy (NCD, LCD, Article). " +
    "Do NOT use `policy_content_extractor` for CMS URLs — only use that for MAC contractor URLs " +
    "(Noridian, Palmetto, NGS, Novitas, WPS, FCSO, CGS).\n\n" +
    "**Input:** `{ documentType: \"ncd\" | \"lcd\" | \"article\", documentId, documentVersion }` — " +
    "use the values returned by `ncd_coverage_search`, `local_lcd_search`, or " +
    "`local_coverage_article_search` on each `topMatches[]` entry.\n\n" +
    "**Output:** JSON with priorAuthRequired, medicalNecessityCriteria, icd10Codes, cptCodes, " +
    "requiredDocumentation, limitationsExclusions, and summary — same shape as policy_content_extractor.";

  async _call(input: z.infer<typeof inputSchema>): Promise<string> {
    const { documentType, documentId, documentVersion } = input;
    const start = Date.now();
    try {
      const details =
        documentType === "ncd"
          ? await cmsCoverageApiClient.fetchNcd(documentId, documentVersion)
          : documentType === "lcd"
            ? await cmsCoverageApiClient.fetchLcd(documentId, documentVersion)
            : await cmsCoverageApiClient.fetchArticle(documentId, documentVersion);

      const out = JSON.stringify({
        documentType,
        documentId,
        documentVersion,
        ...details,
      });
      console.log(
        `[MedicarePolicyDetailTool] ${documentType} ${documentId} v${documentVersion}: ${out.length} chars (~${(
          out.length / 1024
        ).toFixed(1)}KB) in ${Date.now() - start}ms`,
      );
      return out;
    } catch (err: any) {
      console.error(
        `[MedicarePolicyDetailTool] Error for ${documentType} ${documentId}:`,
        err?.message ?? err,
      );
      return JSON.stringify({
        error: err?.message ?? "Unknown CMS Coverage API error",
        documentType,
        documentId,
        documentVersion,
      });
    }
  }
}

export const medicarePolicyDetailTool = new MedicarePolicyDetailTool();
