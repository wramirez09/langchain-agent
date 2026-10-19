/**
 * The one place a prior-auth request becomes a string.
 *
 * A "query" in this product is not a record — it is a single labeled string
 * (`"Guidelines: X. State: Y. Treatment: Z…"`) appended as a chat message, and
 * `components/prior-auth/UserRequestFields.tsx` parses it back out by regex to
 * render the Request Overview card. That round-trip is lossy and brittle, so
 * the two producers — the PA form and the de-identified note ingest — have to
 * emit byte-identical output or the display silently degrades to one run-on
 * sentence.
 *
 * Hence this module. `PriorAuthView.handleGenerateAuth` used to own the join
 * inline; it now calls here, and so does the note path.
 */

/**
 * The seven fields the PA form collects. Structurally identical to
 * `FormFields` in `components/providers/PriorAuthProvider.tsx` — kept as its
 * own declaration so this module stays free of any React import and can be
 * unit-tested (and reused server-side) on its own.
 */
export interface QueryFields {
  guidelines: string;
  state: string;
  treatment: string;
  cptCodes: string;
  diagnosis: string;
  patientHistory: string;
  relevantHistory: string;
}

export interface SerializeOptions {
  /**
   * Free-text appended after " | " — the typed chat input on the form path, or
   * a follow-up question. Kept outside the labeled block because
   * `UserRequestFields` renders it as "Additional Notes".
   */
  note?: string;
  /**
   * The de-identification receipt, e.g. "14 identifiers removed from an
   * uploaded note". Rendered as its own labeled field so the attestation
   * survives into the transcript, the saved query, and the PDF export.
   */
  deidentification?: string;
}

/**
 * Label order matters: `UserRequestFields` locates each label independently but
 * slices every value up to the NEXT label, so a reordering here changes what
 * lands in each rendered field. The odd `"CPT/HCPCS : "` spacing is load-bearing
 * for the same reason — its regex is `/CPT\s*\/\s*HCPCS\s*:/`, but the legacy
 * form emitted this exact spelling and saved queries on disk contain it.
 */
export function serializeQuery(
  fields: Partial<QueryFields>,
  options: SerializeOptions = {},
): string {
  const entries = [
    fields.guidelines && `Guidelines: ${fields.guidelines}`,
    fields.state && `State: ${fields.state}`,
    fields.treatment && `Treatment: ${fields.treatment}`,
    fields.cptCodes && `CPT/HCPCS : ${fields.cptCodes}`,
    fields.diagnosis && `Diagnosis: ${fields.diagnosis}`,
    fields.patientHistory && `History: ${fields.patientHistory}`,
    fields.relevantHistory &&
      `Relevant Medical History: ${fields.relevantHistory}`,
    options.deidentification &&
      `De-identification: ${options.deidentification}`,
  ].filter(Boolean);

  const labeled = entries.join(". ");
  return [labeled, (options.note ?? "").trim()].filter(Boolean).join(" | ");
}

/** True when there is anything worth sending. */
export function hasQueryContent(
  fields: Partial<QueryFields>,
  options: SerializeOptions = {},
): boolean {
  return serializeQuery(fields, options).length > 0;
}
