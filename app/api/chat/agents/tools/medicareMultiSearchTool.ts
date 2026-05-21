import { StructuredTool } from "@langchain/core/tools";
import {
  MedicareSearchInputSchema,
  MedicareSearchInput,
} from "./utils/medicareSearchTypes";
import { NCDCoverageSearchTool } from "./NCDCoverageSearchTool";
import { localLcdSearchTool } from "./localLcdSearchTool";
import { localCoverageArticleSearchTool } from "./localArticleSearchTool";

// Single agent turn that runs NCD + LCD + LCA in parallel via Promise.all.
// Replaces 2-3 sequential agent round-trips (~20-40s saved). The agent should
// call this once instead of issuing three separate tool calls. Falls back to
// NCD-only when state is missing — matches the prior prompt's behavior.
class MedicareMultiSearchTool extends StructuredTool<typeof MedicareSearchInputSchema> {
  name = "medicare_multi_search";
  schema = MedicareSearchInputSchema;
  description =
    "Runs NCD, LCD, and LCA Medicare coverage searches in a SINGLE parallel call. " +
    "Prefer this tool over calling ncd_coverage_search / local_lcd_search / local_coverage_article_search " +
    "individually — it executes them concurrently and returns one combined JSON.\n\n" +
    "**Input fields:** same as the individual Medicare search tools (query, treatment, " +
    "diagnosis, cpt, icd10, state, maxResults). If `state` is omitted, only NCD runs " +
    "(LCD/LCA require a U.S. state).\n\n" +
    "**Output:** `{ ncd: {...}, lcd: {...} | null, lca: {...} | null }` where each section " +
    "matches the shape returned by the corresponding single-tool call.\n\n" +
    "**Next step:** Use `medicare_policy_detail` with `{ documentType, documentId, documentVersion }` " +
    "from the top matches across any of the three sections.";

  private ncd = new NCDCoverageSearchTool();

  async _call(input: MedicareSearchInput): Promise<string> {
    const hasState = !!(input.state && input.state.trim());

    const ncdPromise = this.ncd.invoke(input);
    const lcdPromise = hasState
      ? localLcdSearchTool.invoke(input)
      : Promise.resolve(null);
    const lcaPromise = hasState
      ? localCoverageArticleSearchTool.invoke(input)
      : Promise.resolve(null);

    const start = Date.now();
    const [ncdRaw, lcdRaw, lcaRaw] = await Promise.all([
      ncdPromise,
      lcdPromise,
      lcaPromise,
    ]);
    console.log(
      `[MedicareMultiSearchTool] Parallel NCD+LCD+LCA: ${Date.now() - start}ms (state=${input.state ?? "none"})`,
    );

    const safeParse = (raw: string | null) => {
      if (raw == null) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return { error: "Failed to parse sub-tool output", raw };
      }
    };

    return JSON.stringify({
      ncd: safeParse(ncdRaw),
      lcd: safeParse(lcdRaw),
      lca: safeParse(lcaRaw),
    });
  }
}

export const medicareMultiSearchTool = new MedicareMultiSearchTool();
