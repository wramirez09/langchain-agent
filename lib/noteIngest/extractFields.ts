/**
 * De-identified note -> the seven PA form fields.
 *
 * Split deliberately in two. `extractDeterministic` handles everything a
 * lookup table or a cue-gated pattern can decide -- codes, state, payer class
 * -- because those are the fields a wrong answer is most expensive on, and a
 * table is reproducible where a model is not. Only `treatment`,
 * `patientHistory` and `relevantHistory` need semantics, and those go to
 * `llmExtractor()` (gpt-4o-mini, temperature 0) with a zod-validated shape.
 *
 * Everything here runs on text that has ALREADY been through `lib/phi`. That
 * is what makes the LLM call permissible at all under
 * `documents/privacy-policy.md` ("OpenAI: AI model processing (de-identified
 * queries only)"), and it is also why the code extractors are safe: ZIPs and
 * MRNs are already placeholders by the time they run, so a five-digit number
 * with a CPT cue really is a CPT code.
 */

import { z } from "zod";
import {
  data as STATE_DATA,
  resolveStateId,
} from "@/app/agents/metaData/states";
import type { QueryFields } from "@/lib/priorAuth/serializeQuery";
import { extractCptFromNote, extractIcd10FromNote } from "./codes";

/**
 * Commercial payers we can recognize by name. Presence of any of these, with
 * no Medicare mention, classifies the request as Commercial.
 */
const COMMERCIAL_PAYERS = [
  "Aetna",
  "Cigna",
  "Humana",
  "UnitedHealthcare",
  "United Healthcare",
  "UHC",
  "Anthem",
  "Blue Cross",
  "BlueCross",
  "Blue Shield",
  "BlueShield",
  "BCBS",
  "Kaiser",
  "Oscar",
  "Centene",
  "Molina",
  "Ambetter",
  "Elevance",
  "Evolent",
  "eviCore",
  "Carelon",
  "InterQual",
  "MCG",
];

export interface DeterministicFields {
  state: string;
  guidelines: string;
  cptCodes: string;
  diagnosis: string;
}

/**
 * Canonical descriptions, keyed by the plain state name.
 *
 * `data` holds MAC jurisdictions, not states: California appears as
 * "California - Entire State", "- Northern" and "- Southern". The form's
 * dropdown is built from these exact strings, so the extracted value has to be
 * one of them or it will not select. `resolveStateId` already knows how to
 * pick (exact match, then the "- entire" variant, then a prefix), so route
 * through it rather than re-deriving the rule.
 */
function canonicalState(nameOrAbbr: string): string {
  const id = resolveStateId(nameOrAbbr);
  if (id === null) return "";
  return STATE_DATA.find((d) => d.state_id === id)?.description ?? "";
}

/**
 * The plain state names present in the table, longest first so "West Virginia"
 * is tested before "Virginia".
 */
const BASE_STATE_NAMES = [
  ...new Set(STATE_DATA.map((d) => d.description.split(" - ")[0].trim())),
].sort((a, b) => b.length - a.length);

/**
 * Find the state.
 *
 * Full names first, since they are unambiguous. Two-letter codes are trusted
 * only after a comma AND before something that looks like the rest of an
 * address -- a ZIP, a redaction placeholder, or end of clause. Without that
 * second guard "continue PT, OK to advance" reads as Oklahoma, and "pain, OR
 * numbness" as Oregon.
 */
export function detectState(text: string): string {
  for (const name of BASE_STATE_NAMES) {
    const re = new RegExp("\\b" + name.replace(/\s+/g, "\\s+") + "\\b", "i");
    if (re.test(text)) return canonicalState(name);
  }
  const m = text.match(/,\s*([A-Z]{2})\b(?=\s*(?:\[|\d{5}|[.,;:]|$))/m);
  if (m) return canonicalState(m[1]);
  return "";
}

/**
 * Medicare vs Commercial. An explicit Medicare mention wins: the Medicare path
 * (NCD/LCD) is the narrower, more evidence-backed search, so misrouting a
 * Medicare request into the commercial corpus loses more than the reverse.
 */
export function detectGuidelines(text: string): string {
  if (/\bmedicare\b/i.test(text)) return "Medicare";
  if (/\bmedicaid\b/i.test(text)) return "Medicare";
  for (const payer of COMMERCIAL_PAYERS) {
    if (
      new RegExp("\\b" + payer.replace(/\s+/g, "\\s+") + "\\b", "i").test(text)
    )
      return "Commercial";
  }
  if (/\b(?:commercial|private insurance|employer[- ]sponsored)\b/i.test(text))
    return "Commercial";
  return "";
}

/** Everything decidable without a model. */
export function extractDeterministic(text: string): DeterministicFields {
  return {
    state: detectState(text),
    guidelines: detectGuidelines(text),
    cptCodes: extractCptFromNote(text).join(", "),
    diagnosis: extractIcd10FromNote(text).join(", "),
  };
}

/* ------------------------------------------------------------------ */
/* the model pass                                                      */
/* ------------------------------------------------------------------ */

export const NarrativeSchema = z.object({
  treatment: z
    .string()
    .describe(
      "The specific procedure or service being requested, e.g. 'lumbar fusion L4-L5' or 'MRI lumbar spine'. Empty string if the note does not name one.",
    ),
  diagnosisText: z
    .string()
    .describe(
      "The clinical diagnosis in words, e.g. 'lumbar spinal stenosis with radiculopathy'. Not a code.",
    ),
  patientHistory: z
    .string()
    .describe(
      "Conservative therapy already tried and for how long, plus symptom duration. Preserve every duration verbatim.",
    ),
  relevantHistory: z
    .string()
    .describe(
      "Other facts bearing on medical necessity: imaging findings, objective measurements, failed treatments, prior surgery, comorbidities, contraindications.",
    ),
});

export type Narrative = z.infer<typeof NarrativeSchema>;

const SYSTEM = [
  "You extract prior-authorization fields from a clinical note.",
  "",
  "The note has ALREADY been de-identified: bracketed tokens such as [NAME],",
  "[DATE], [MRN] and [GEO] are redaction placeholders. Never try to guess what",
  "they stood for, never invent a substitute, and never copy them into output.",
  "",
  "Rules:",
  "- Use only what the note says. Do not infer, extrapolate, or add clinical",
  "  detail that is not present. An empty string is the correct answer when the",
  "  note does not cover a field.",
  "- Preserve durations exactly as written ('8 weeks of PT', 'NSAIDs x3 months').",
  "  Prior-authorization criteria are decided on them.",
  "- Preserve laterality, spinal levels, and measurements verbatim.",
  "- Do not output CPT or ICD-10 codes; those are extracted separately.",
].join("\n");

/**
 * The narrative fields. Isolated behind its own function so the route can fall
 * back to the deterministic fields alone when the model call fails -- a
 * partially-filled query still screens, an error page does not.
 */
export async function extractNarrative(text: string): Promise<Narrative> {
  const { llmExtractor } = await import("@/lib/llm");
  const model = llmExtractor().withStructuredOutput(NarrativeSchema, {
    name: "prior_auth_fields",
  });
  return (await model.invoke([
    { role: "system", content: SYSTEM },
    { role: "user", content: text },
  ])) as Narrative;
}

/**
 * Full note -> the seven fields. `diagnosis` prefers codes when the note
 * carried them and falls back to the model's prose, which is what
 * `UserRequestFields` and the agent's Request Overview both expect.
 */
export async function extractQueryFields(
  text: string,
): Promise<{ fields: QueryFields; usedModel: boolean }> {
  const det = extractDeterministic(text);

  let narrative: Narrative | null = null;
  try {
    narrative = await extractNarrative(text);
  } catch {
    // Deliberately swallowed: the deterministic fields are enough to run a
    // screening, and the caller must not surface model internals.
    narrative = null;
  }

  const diagnosis =
    det.diagnosis && narrative?.diagnosisText
      ? `${narrative.diagnosisText} (${det.diagnosis})`
      : det.diagnosis || (narrative?.diagnosisText ?? "");

  return {
    usedModel: narrative !== null,
    fields: {
      guidelines: det.guidelines,
      state: det.state,
      treatment: narrative?.treatment ?? "",
      cptCodes: det.cptCodes,
      diagnosis,
      patientHistory: narrative?.patientHistory ?? "",
      relevantHistory: narrative?.relevantHistory ?? "",
    },
  };
}
