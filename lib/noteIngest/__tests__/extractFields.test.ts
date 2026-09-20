const invokeMock = jest.fn();
jest.mock("@/lib/llm", () => ({
  llmExtractor: () => ({
    withStructuredOutput: () => ({ invoke: invokeMock }),
  }),
}));

import {
  detectState,
  detectGuidelines,
  extractDeterministic,
  extractQueryFields,
  NarrativeSchema,
} from "../extractFields";

beforeEach(() => invokeMock.mockReset());

describe("detectState", () => {
  it("finds a full state name", () => {
    expect(detectState("Seen in Texas last week")).toBe("Texas");
    expect(detectState("resident of New Hampshire")).toBe("New Hampshire");
  });

  /**
   * `data` holds MAC jurisdictions, so the plain name a note uses has to be
   * canonicalized to a string the form dropdown actually contains.
   */
  it("canonicalizes to the jurisdiction description the form uses", () => {
    expect(detectState("seen in California")).toBe("California - Entire State");
  });

  it("prefers the longer name when two overlap", () => {
    expect(detectState("resident of West Virginia")).toBe("West Virginia");
  });

  it("is case-insensitive", () => {
    expect(detectState("seen in CALIFORNIA")).toBe("California - Entire State");
  });

  /** The state survives redaction as ", TX" -- see the city/state/ZIP rule. */
  it("reads the two-letter code left behind by geo redaction", () => {
    expect(detectState("[GEO], TX [GEO]")).toBe("Texas");
  });

  it("does not treat ordinary English words as state codes", () => {
    expect(detectState("improvement IN range of motion")).toBe("");
    expect(detectState("pain OR numbness")).toBe("");
    expect(detectState("continue PT, OK to advance")).toBe("");
  });

  it("returns an empty string when there is no state", () => {
    expect(detectState("68F with low back pain")).toBe("");
    expect(detectState("")).toBe("");
  });
});

describe("detectGuidelines", () => {
  it("classifies Medicare", () => {
    expect(detectGuidelines("Medicare Part B coverage")).toBe("Medicare");
  });

  it("classifies a named commercial payer", () => {
    expect(detectGuidelines("Aetna commercial plan")).toBe("Commercial");
    expect(detectGuidelines("Coverage: Blue Cross Blue Shield")).toBe(
      "Commercial",
    );
    expect(detectGuidelines("reviewed against eviCore criteria")).toBe(
      "Commercial",
    );
  });

  /** Misrouting a Medicare request into the commercial corpus costs more. */
  it("prefers Medicare when both are mentioned", () => {
    expect(detectGuidelines("Medicare Advantage via Humana")).toBe("Medicare");
  });

  it("returns an empty string when no payer is named", () => {
    expect(detectGuidelines("68F with low back pain")).toBe("");
  });
});

describe("extractDeterministic", () => {
  it("fills codes, state and payer from a realistic redacted note", () => {
    const note = [
      "Patient: [NAME]  DOB: [DOB]  MRN: [MRN]",
      "[GEO], TX [GEO]. Coverage: Aetna.",
      "68F with 6 months of low back pain. Failed PT x8 weeks.",
      "MRI shows L4-L5 and T12 stenosis. Dx M48.06.",
      "Requesting CPT 22633, 22634.",
    ].join("\n");
    expect(extractDeterministic(note)).toEqual({
      state: "Texas",
      guidelines: "Commercial",
      cptCodes: "22633, 22634",
      diagnosis: "M48.06",
    });
  });

  it("returns empty strings rather than guesses on a bare note", () => {
    expect(extractDeterministic("68F with low back pain")).toEqual({
      state: "",
      guidelines: "",
      cptCodes: "",
      diagnosis: "",
    });
  });
});

describe("extractQueryFields", () => {
  const narrative = {
    treatment: "lumbar fusion L4-L5",
    diagnosisText: "lumbar spinal stenosis",
    patientHistory: "6 months of pain; failed PT x8 weeks",
    relevantHistory: "MRI shows L4-L5 stenosis; no prior lumbar surgery",
  };

  it("merges the deterministic and model passes", async () => {
    invokeMock.mockResolvedValue(narrative);
    const { fields, usedModel } = await extractQueryFields(
      "Aetna. Texas. Dx M48.06. CPT 22633. Failed PT x8 weeks.",
    );
    expect(usedModel).toBe(true);
    expect(fields.guidelines).toBe("Commercial");
    expect(fields.state).toBe("Texas");
    expect(fields.cptCodes).toBe("22633");
    expect(fields.treatment).toBe("lumbar fusion L4-L5");
    expect(fields.diagnosis).toBe("lumbar spinal stenosis (M48.06)");
    expect(fields.patientHistory).toContain("x8 weeks");
  });

  it("uses the code alone when the model gives no prose diagnosis", async () => {
    invokeMock.mockResolvedValue({ ...narrative, diagnosisText: "" });
    const { fields } = await extractQueryFields("Dx M48.06");
    expect(fields.diagnosis).toBe("M48.06");
  });

  /**
   * A partially-filled query still screens; an error page does not. The model
   * is the optional half of this pipeline, not the load-bearing one.
   */
  it("degrades to the deterministic fields when the model call fails", async () => {
    invokeMock.mockRejectedValue(new Error("upstream 503"));
    const { fields, usedModel } = await extractQueryFields(
      "Medicare. Texas. Dx M48.06. CPT 22633.",
    );
    expect(usedModel).toBe(false);
    expect(fields.guidelines).toBe("Medicare");
    expect(fields.state).toBe("Texas");
    expect(fields.cptCodes).toBe("22633");
    expect(fields.diagnosis).toBe("M48.06");
    expect(fields.treatment).toBe("");
    expect(fields.patientHistory).toBe("");
  });

  it("sends the note to the model as the user turn, with a system prompt", async () => {
    invokeMock.mockResolvedValue(narrative);
    await extractQueryFields("the redacted note body");
    const messages = invokeMock.mock.calls[0][0];
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toMatch(/already been de-identified/i);
    expect(messages[1]).toEqual({
      role: "user",
      content: "the redacted note body",
    });
  });
});

describe("NarrativeSchema", () => {
  it("requires all four narrative fields", () => {
    expect(
      NarrativeSchema.safeParse({
        treatment: "a",
        diagnosisText: "b",
        patientHistory: "c",
        relevantHistory: "d",
      }).success,
    ).toBe(true);
    expect(NarrativeSchema.safeParse({ treatment: "a" }).success).toBe(false);
  });
});
