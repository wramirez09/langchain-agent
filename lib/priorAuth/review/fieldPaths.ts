/**
 * Turning machine paths into things a person can act on, and holding the line
 * on what a finding is allowed to say.
 *
 * The message catalog here is not stylistic. A review is persisted alongside
 * the assistant message and rendered into exported PDFs, so any finding that
 * interpolated artifact text would copy clinical narrative into two more
 * places. Every user-facing sentence is therefore a fixed template; the only
 * values ever substituted are codes, counts, and section names.
 */

import { sectionIdForPath } from '../artifactSections'

/** `["requestOverview","cpt",0,"code"]` → `"requestOverview.cpt[0].code"` */
export function pointerFromZodPath(path: readonly PropertyKey[]): string {
  let out = ''
  for (const seg of path ?? []) {
    if (typeof seg === 'number') out += `[${seg}]`
    else out += out ? `.${String(seg)}` : String(seg)
  }
  return out
}

/** `"relevantCodes.cpt[3].code"` → `"relevantCodes.cpt[].code"` */
export function pointerTemplate(pointer: string): string {
  return pointer.replace(/\[\d+\]/g, '[]')
}

/** Human names for the paths a finding can land on. */
export const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  guidelineBasis: 'Guideline basis',
  fallbackNotice: 'Fallback notice',
  phiNotice: 'PHI notice',
  disclaimer: 'Disclaimer',

  requestOverview: 'Request Overview',
  'requestOverview.treatment': 'Request Overview → Treatment',
  'requestOverview.diagnosis': 'Request Overview → Diagnosis',
  'requestOverview.cpt': 'Request Overview → CPT / HCPCS',
  'requestOverview.cpt[]': 'Request Overview → CPT / HCPCS',
  'requestOverview.cpt[].code': 'Request Overview → CPT / HCPCS',
  'requestOverview.icd10': 'Request Overview → ICD-10',
  'requestOverview.icd10[]': 'Request Overview → ICD-10',
  'requestOverview.icd10[].code': 'Request Overview → ICD-10',
  'requestOverview.suggestedCpt': 'Likely CPT / HCPCS options',
  'requestOverview.suggestedCpt[]': 'Likely CPT / HCPCS options',
  'requestOverview.suggestedCpt[].code': 'Likely CPT / HCPCS options',
  'requestOverview.suggestedIcd10': 'Likely ICD-10 options',
  'requestOverview.suggestedIcd10[]': 'Likely ICD-10 options',
  'requestOverview.suggestedIcd10[].code': 'Likely ICD-10 options',
  'requestOverview.suggestedCodesNote': 'Suggested codes note',
  'requestOverview.medicalHistory': 'Clinical Context → Medical history',
  'requestOverview.keyFindings': 'Clinical Context → Key findings',

  priorAuthRequired: 'Authorization → Requirement',
  priorAuthRationale: 'Authorization → Rationale',

  medicarePolicies: 'Medicare Coverage',
  medicalNecessityCriteria: 'Necessity Criteria',

  relevantCodes: 'Relevant Codes',
  'relevantCodes.cpt': 'Relevant Codes → CPT / HCPCS',
  'relevantCodes.cpt[]': 'Relevant Codes → CPT / HCPCS',
  'relevantCodes.cpt[].code': 'Relevant Codes → CPT / HCPCS',
  'relevantCodes.icd10': 'Relevant Codes → ICD-10',
  'relevantCodes.icd10[]': 'Relevant Codes → ICD-10',
  'relevantCodes.icd10[].code': 'Relevant Codes → ICD-10',
  'relevantCodes.cptNote': 'Relevant Codes → CPT note',
  'relevantCodes.icd10Note': 'Relevant Codes → ICD-10 note',

  requiredDocumentation: 'Required Documentation',
  limitations: 'Limitations & Exclusions',

  summary: 'Summary',
  'summary.determination': 'Summary → Determination',
  'summary.determinationLabel': 'Summary → Determination label',
  'summary.rationale': 'Summary → Rationale',
  'summary.missingItems': 'Summary → Items to strengthen the request',
}

/** Title Case fallback so an unmapped path still reads as English. */
function humanize(pointer: string): string {
  return pointer
    .replace(/\[\d+\]/g, '')
    .split('.')
    .map((seg) =>
      seg
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/^./, (c) => c.toUpperCase()),
    )
    .join(' → ')
}

export function labelForPointer(pointer: string): string {
  return (
    FIELD_LABELS[pointer] ??
    FIELD_LABELS[pointerTemplate(pointer)] ??
    humanize(pointer)
  )
}

export function sectionIdForPointer(pointer: string): string | undefined {
  return sectionIdForPath(pointer)
}

// ---------------------------------------------------------------------------
// Message catalog — the ONLY source of user-facing finding text
// ---------------------------------------------------------------------------

/**
 * Zod 4 renamed several issue codes (`invalid_enum_value` → `invalid_value`,
 * `invalid_string` → `invalid_format`). Both spellings are mapped so a zod
 * upgrade cannot silently degrade every message to the generic fallback.
 */
const ZOD_MESSAGES: Record<string, string> = {
  invalid_type: 'Missing, or not the expected type.',
  invalid_value: 'Not one of the allowed values.',
  invalid_literal: 'Not one of the allowed values.',
  invalid_enum_value: 'Not one of the allowed values.',
  invalid_format: 'Not in the expected format.',
  invalid_string: 'Not in the expected format.',
  too_small: 'Shorter than expected.',
  too_big: 'Longer than expected.',
  invalid_union: 'Does not match any allowed shape.',
  unrecognized_keys: 'Contains fields the schema does not define.',
}

const GENERIC_SCHEMA_MESSAGE = 'Does not match the expected shape.'

export function messageForZodIssue(code: string): string {
  return ZOD_MESSAGES[code] ?? GENERIC_SCHEMA_MESSAGE
}

export const MESSAGES = {
  sectionMissing: 'This section is missing from the report.',
  sectionEmpty: 'This section came back empty, so it was left out of the report.',
  sectionNotApplicable:
    'This section should not appear for a commercial guideline basis.',
  medicarePoliciesMissing:
    'Medicare coverage documents were retrieved but no policies were reported.',
  fallbackNoticeMissing:
    'Commercial guidelines were used in place of Medicare, but no fallback notice was given.',
  rationaleMissing: 'No rationale was given for this determination.',
  unknownField: 'This field is not part of the report format and was ignored.',

  codeNotInEvidence: 'This code does not appear in any retrieved source.',
  codeEvidenceUnavailable:
    'This code could not be checked — the sources retrieved carry no codes of this type.',
  codeSourceOutOfScope:
    'This code was found only in sources that are not about the requested procedure.',
  codeCitedAsNonCovered:
    'This code appears in the cited policy only in its non-covered list.',
  codeOnlyInBroaderSource:
    'This code comes from a broad guideline covering many procedures. The guideline specific to this request does not list it — verify it applies before submitting.',

  repairCodeBackfill: 'Filled in from the retrieved guideline because it was empty.',
} as const

/** Every string a finding may carry. Asserted in tests. */
export const ALL_MESSAGES: readonly string[] = [
  ...Object.values(MESSAGES),
  ...Object.values(ZOD_MESSAGES),
  GENERIC_SCHEMA_MESSAGE,
]
