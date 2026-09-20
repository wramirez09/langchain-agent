import {
  serializeQuery,
  hasQueryContent,
  type QueryFields,
} from "../serializeQuery";

const FULL: QueryFields = {
  guidelines: "Commercial",
  state: "Texas",
  treatment: "lumbar fusion L4-L5",
  cptCodes: "22633",
  diagnosis: "M48.06",
  patientHistory: "8 weeks PT, NSAIDs x3 months",
  relevantHistory: "no prior lumbar surgery",
};

/**
 * The exact join `PriorAuthView.handleGenerateAuth` performed inline before
 * this module existed. Saved queries on disk and every regex in
 * UserRequestFields were built against this output, so it is the oracle.
 */
function legacySerialize(f: QueryFields, chatInput: string): string {
  const formEntries = [
    f.guidelines && `Guidelines: ${f.guidelines}`,
    f.state && `State: ${f.state}`,
    f.treatment && `Treatment: ${f.treatment}`,
    f.cptCodes && `CPT/HCPCS : ${f.cptCodes}`,
    f.diagnosis && `Diagnosis: ${f.diagnosis}`,
    f.patientHistory && `History: ${f.patientHistory}`,
    f.relevantHistory && `Relevant Medical History: ${f.relevantHistory}`,
  ].filter(Boolean);
  const formString = formEntries.join(". ");
  return [formString, chatInput.trim()].filter(Boolean).join(" | ");
}

describe("serializeQuery", () => {
  it("matches the legacy inline join byte for byte", () => {
    expect(serializeQuery(FULL)).toBe(legacySerialize(FULL, ""));
  });

  it("matches the legacy join when a free-text note is appended", () => {
    expect(serializeQuery(FULL, { note: "  is this covered?  " })).toBe(
      legacySerialize(FULL, "  is this covered?  "),
    );
  });

  it("matches the legacy join on a sparse field set", () => {
    const sparse: QueryFields = {
      ...FULL,
      state: "",
      cptCodes: "",
      relevantHistory: "",
    };
    expect(serializeQuery(sparse)).toBe(legacySerialize(sparse, ""));
  });

  it("preserves the load-bearing 'CPT/HCPCS : ' spacing", () => {
    expect(serializeQuery({ cptCodes: "22633" })).toBe("CPT/HCPCS : 22633");
  });

  it("omits empty fields entirely rather than emitting bare labels", () => {
    expect(serializeQuery({ treatment: "MRI lumbar spine", state: "" })).toBe(
      "Treatment: MRI lumbar spine",
    );
  });

  it("returns an empty string when there is nothing to send", () => {
    expect(serializeQuery({})).toBe("");
    expect(serializeQuery({ treatment: "" }, { note: "   " })).toBe("");
  });

  it("appends the de-identification receipt as the last labeled field", () => {
    const out = serializeQuery(FULL, {
      deidentification: "14 identifiers removed from an uploaded note",
    });
    expect(out).toContain(
      "De-identification: 14 identifiers removed from an uploaded note",
    );
    // Last, so it never splits a clinical field's value.
    expect(out.indexOf("De-identification:")).toBeGreaterThan(
      out.indexOf("Relevant Medical History:"),
    );
  });

  it("keeps the receipt inside the labeled block, before the ' | ' note", () => {
    const out = serializeQuery(
      { treatment: "MRI" },
      { deidentification: "3 identifiers removed", note: "covered?" },
    );
    expect(out).toBe(
      "Treatment: MRI. De-identification: 3 identifiers removed | covered?",
    );
  });

  it("emits a receipt-only query when no fields were extracted", () => {
    expect(
      serializeQuery({}, { deidentification: "2 identifiers removed" }),
    ).toBe("De-identification: 2 identifiers removed");
  });
});

describe("hasQueryContent", () => {
  it("is false for empty input and true once anything is present", () => {
    expect(hasQueryContent({})).toBe(false);
    expect(hasQueryContent({ guidelines: "" }, { note: "  " })).toBe(false);
    expect(hasQueryContent({ guidelines: "Medicare" })).toBe(true);
    expect(hasQueryContent({}, { note: "hello" })).toBe(true);
  });
});
