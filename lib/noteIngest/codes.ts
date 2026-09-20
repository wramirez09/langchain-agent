/**
 * CPT/HCPCS and ICD-10 extraction from a de-identified clinical note.
 *
 * `extractCPTCodes` / `extractICD10Codes` in
 * `app/api/chat/agents/tools/utils/commercialGuidelineTypes.ts` already exist,
 * but they are tuned for a curated guideline corpus where every five-digit
 * number IS a CPT code. Pointed at note prose they are unsafe in both
 * directions:
 *
 *   - the `CPT` cue is optional, so any five-digit number qualifies;
 *   - the ICD pattern is `[A-Z]\d{2}` with the `i` flag and an optional cue,
 *     which matches `T12` -- a thoracic vertebra, and one of the most common
 *     tokens in a spine note. Reading that as ICD-10 code T12 ("unspecified
 *     injury") would send the screening after the wrong diagnosis.
 *
 * So intake uses its own cue-gated pass. A code is accepted only when the note
 * says it is a code, or when its shape cannot be anything else. Missing a code
 * is cheap -- the agent re-derives it, and `lib/priorAuth/backfillCodes.ts`
 * fills suggestions downstream. Inventing one is not.
 */

/** C1-C7, T1-T12, L1-L5, S1-S5 -- spinal levels, never diagnosis codes. */
const SPINAL_LEVEL = /^(?:C[1-7]|T(?:1[0-2]|[1-9])|L[1-5]|S[1-5])$/i;

/**
 * A well-formed ICD-10-CM code: a letter, two alphanumerics, and optionally a
 * decimal with up to four more.
 */
const ICD10_SHAPE = /^[A-TV-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?$/;

const CPT_CUE = /(?:\bCPT\b|\bHCPCS\b|procedure code|proc code|billing code)/i;
const ICD_CUE =
  /(?:\bICD-?\s?10(?:-?CM)?\b|\bICD\b|diagnosis code|\bDx code\b)/i;

/** Dedupe, preserving first-seen order. */
function uniq(items: string[]): string[] {
  return [...new Set(items)];
}

/**
 * Text within `window` characters before `index` -- used to ask "did the note
 * say this was a code?" without scanning the whole document per candidate.
 */
function lookBack(text: string, index: number, window = 40): string {
  return text.slice(Math.max(0, index - window), index);
}

/**
 * CPT/HCPCS codes. Requires an explicit cue nearby, because a bare five-digit
 * number in a note is far more likely to be something else.
 *
 * Accepts the CPT form (5 digits, optional 2-char modifier) and the HCPCS
 * Level II form (a letter followed by 4 digits).
 */
export function extractCptFromNote(text: string): string[] {
  const out: string[] = [];
  const re = /\b(\d{5}|[A-V]\d{4})\b/gi;

  for (const m of text.matchAll(re)) {
    if (m.index === undefined) continue;
    const code = m[1].toUpperCase();
    const before = lookBack(text, m.index);
    // A cue either immediately before this candidate, or before a run of
    // comma-separated codes it belongs to ("CPT 22633, 22634, 22842").
    if (!CPT_CUE.test(before) && !/[,/]\s*$/.test(before)) continue;
    if (/^\d{5}$/.test(code) && /^(?:19|20)\d{2}$/.test(code.slice(0, 4))) {
      continue;
    }
    out.push(code);
  }
  return uniq(out);
}

/**
 * ICD-10 codes. Accepted when either the note names them as diagnosis codes,
 * or the code carries a decimal (`M48.06`), which no spinal level or ordinary
 * abbreviation does.
 */
export function extractIcd10FromNote(text: string): string[] {
  const out: string[] = [];
  const re = /\b([A-Za-z][0-9][0-9A-Za-z](?:\.[0-9A-Za-z]{1,4})?)\b/g;

  for (const m of text.matchAll(re)) {
    if (m.index === undefined) continue;
    const raw = m[1];
    const code = raw.toUpperCase();
    if (SPINAL_LEVEL.test(raw)) continue;
    if (!ICD10_SHAPE.test(code)) continue;

    const hasDecimal = code.includes(".");
    const before = lookBack(text, m.index);
    const cued = ICD_CUE.test(before) || /[,/]\s*$/.test(before);
    if (!hasDecimal && !cued) continue;

    out.push(code);
  }
  return uniq(out);
}
