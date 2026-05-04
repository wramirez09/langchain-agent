import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { cache } from "@/lib/cache";
import { cmsCoverageApiClient } from "./utils/cmsCoverageApiClient";

const inputSchema = z.object({
  documentType: z.enum(["ncd", "lcd", "article"]),
  documentId: z.string().min(1),
  documentVersion: z.number().int().nonnegative(),
});

// Negative-result TTL: when a fetch fails (404, malformed input, etc.) the
// agent must not retry the same (type,id,version) inside the same run. The
// prompt forbids it, but prompt-only enforcement is unreliable. A short
// in-process cache replays the same error for ~1 minute, which covers any
// single agent turn (max 300s wall, typically <60s) without leaking error
// state across distinct requests for long.
const NEGATIVE_CACHE_TTL_MS = 60 * 1000;

function negativeCacheKey(
  type: string,
  id: string,
  version: number,
): string {
  return `cms-detail-error:${type}:${id}:${version}`;
}

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

    const negKey = negativeCacheKey(documentType, documentId, documentVersion);
    const cachedError = cache.get<string>(negKey);
    if (cachedError) {
      console.warn(
        `[MedicarePolicyDetailTool] Replaying cached error for ${documentType} ${documentId} v${documentVersion} (no retry within ${NEGATIVE_CACHE_TTL_MS}ms)`,
      );
      return cachedError;
    }

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
      const errOut = JSON.stringify({
        error: err?.message ?? "Unknown CMS Coverage API error",
        documentType,
        documentId,
        documentVersion,
      });
      cache.set(negKey, errOut, NEGATIVE_CACHE_TTL_MS);
      return errOut;
    }
  }
}

export const medicarePolicyDetailTool = new MedicarePolicyDetailTool();
