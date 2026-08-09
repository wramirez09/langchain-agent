import {
  backfillArtifactCodes,
  collectToolOutputs,
  encodeCodePatch,
  extractRetrievedCodes,
  parseLabeledCode,
  splitCodePatch,
  sourceMatchesRequest,
  BACKFILL_NOTE,
  CODE_PATCH_SENTINEL,
  EMPTY_RETRIEVED_CODES,
  MAX_SOURCE_PROCEDURES,
} from "../backfillCodes";
import type { PartialPriorAuthArtifact } from "../artifactSchema";

const toolOutput = (matches: unknown[]) =>
  JSON.stringify({ query: "laminectomy", topMatches: matches, relatedMatches: [] });

const cervical = {
  title: "Cervical Laminectomy",
  score: 0.91,
  procedures: ["cervical laminectomy", "cervical decompression"],
  cptCodes: ["63045 — Posterior decompression without fusion", "63048"],
  icd10Codes: ["M54.2 — Cervicalgia"],
};

const aggregator = {
  title: "Spine Surgery Aggregator",
  score: 0.44,
  procedures: ["kyphoplasty", "vertebroplasty"],
  cptCodes: ["22551 — Anterior cervical fusion"],
  icd10Codes: ["M50.20"],
};

describe("parseLabeledCode", () => {
  it("splits `CODE — descriptor`", () => {
    expect(parseLabeledCode("63045 — Posterior decompression")).toEqual({
      code: "63045",
      label: "Posterior decompression",
    });
  });

  it("accepts a hyphen separator", () => {
    expect(parseLabeledCode("M54.2 - Cervicalgia")).toEqual({
      code: "M54.2",
      label: "Cervicalgia",
    });
  });

  it("keeps a bare code with an empty label", () => {
    expect(parseLabeledCode("11138")).toEqual({ code: "11138", label: "" });
  });

  it("does not treat a numeric modifier as a descriptor", () => {
    expect(parseLabeledCode("97110-59")).toEqual({ code: "97110-59", label: "" });
  });

  it("ignores blanks and non-strings", () => {
    expect(parseLabeledCode("   ")).toBeNull();
    expect(parseLabeledCode(null)).toBeNull();
    expect(parseLabeledCode(42)).toBeNull();
  });
});

describe("extractRetrievedCodes", () => {
  it("takes the highest-scoring match, not the first one", () => {
    const codes = extractRetrievedCodes([toolOutput([aggregator, cervical])]);
    expect(codes.sourceTitle).toBe("Cervical Laminectomy");
    expect(codes.cpt).toEqual([
      { code: "63045", label: "Posterior decompression without fusion" },
      { code: "63048", label: "" },
    ]);
    expect(codes.icd10).toEqual([{ code: "M54.2", label: "Cervicalgia" }]);
  });

  it("compares across multiple tool calls", () => {
    const codes = extractRetrievedCodes([
      toolOutput([aggregator]),
      toolOutput([cervical]),
    ]);
    expect(codes.sourceTitle).toBe("Cervical Laminectomy");
  });

  it("skips matches that carry no codes", () => {
    const codes = extractRetrievedCodes([
      toolOutput([{ title: "Empty", score: 0.99 }, cervical]),
    ]);
    expect(codes.sourceTitle).toBe("Cervical Laminectomy");
  });

  it("dedupes codes case-insensitively", () => {
    const codes = extractRetrievedCodes([
      toolOutput([
        { title: "T", score: 1, icd10Codes: ["m54.2 — Cervicalgia", "M54.2"] },
      ]),
    ]);
    expect(codes.icd10).toEqual([{ code: "m54.2", label: "Cervicalgia" }]);
  });

  it("returns nothing for unparseable or shapeless output", () => {
    expect(extractRetrievedCodes(["not json", "{}", "[]"])).toEqual(
      EMPTY_RETRIEVED_CODES,
    );
    expect(extractRetrievedCodes([])).toEqual(EMPTY_RETRIEVED_CODES);
  });
});

describe("backfillArtifactCodes", () => {
  const codes = extractRetrievedCodes([toolOutput([cervical])]);

  const base = (): PartialPriorAuthArtifact => ({
    kind: "prior-auth-summary",
    title: "Prior Authorization Summary for Cervical Laminectomy",
    requestOverview: {
      treatment: "C2-C5 laminectomy",
      cpt: [],
      icd10: [],
      medicalHistory: "Neck pain",
      keyFindings: [],
    },
    relevantCodes: { cpt: [], icd10: [] },
  });

  it("fills the empty Relevant Codes lists (the reported defect)", () => {
    const { artifact, filled } = backfillArtifactCodes(base(), codes);

    expect(filled).toEqual(["relevantCodes.cpt", "relevantCodes.icd10"]);
    expect(artifact.relevantCodes?.cpt).toEqual(codes.cpt);
    expect(artifact.relevantCodes?.icd10).toEqual(codes.icd10);
  });

  it("never fills the Likely-options lists", () => {
    // The retrieved array is everything the document mentions; the agent's own
    // lists are scoped. Filling one from the other puts two contradictory code
    // lists in the same report.
    const { artifact, filled } = backfillArtifactCodes(base(), codes);

    expect(artifact.requestOverview?.suggestedCpt).toBeUndefined();
    expect(artifact.requestOverview?.suggestedIcd10).toBeUndefined();
    expect(artifact.requestOverview?.suggestedCodesNote).toBeUndefined();
    expect(filled.some((f) => f.startsWith("requestOverview."))).toBe(false);
  });

  it("never overwrites codes the model did supply", () => {
    const artifact = base();
    artifact.relevantCodes = {
      cpt: [{ code: "63047", label: "Lumbar laminectomy" }],
      icd10: [],
    };
    const result = backfillArtifactCodes(artifact, codes);

    expect(result.artifact.relevantCodes?.cpt).toEqual([
      { code: "63047", label: "Lumbar laminectomy" },
    ]);
    expect(result.filled).not.toContain("relevantCodes.cpt");
    expect(result.filled).toContain("relevantCodes.icd10");
  });

  it("leaves the user's own request codes untouched", () => {
    const artifact = base();
    artifact.requestOverview!.cpt = [{ code: "63045", label: "User supplied" }];
    const { artifact: next } = backfillArtifactCodes(artifact, codes);

    expect(next.requestOverview?.cpt).toEqual([
      { code: "63045", label: "User supplied" },
    ]);
  });

  it("marks every filled list as retrieval-derived", () => {
    const { artifact } = backfillArtifactCodes(base(), codes);

    expect(artifact.relevantCodes?.cptNote).toBe(BACKFILL_NOTE);
    expect(artifact.relevantCodes?.icd10Note).toBe(BACKFILL_NOTE);
  });

  it("replaces a contradicting note but keeps a legitimate one", () => {
    const artifact = base();
    artifact.relevantCodes = {
      cpt: [],
      icd10: [],
      cptNote: "No procedure-code list was returned for this guideline.",
      icd10Note: "Additional ICD-10 codes may apply for related conditions.",
    };
    const { artifact: next } = backfillArtifactCodes(artifact, codes);

    expect(next.relevantCodes?.cptNote).toBe(BACKFILL_NOTE);
    expect(next.relevantCodes?.icd10Note).toBe(
      "Additional ICD-10 codes may apply for related conditions. " + BACKFILL_NOTE,
    );
  });

  it("is a no-op when there is nothing retrieved", () => {
    const artifact = base();
    const result = backfillArtifactCodes(artifact, EMPTY_RETRIEVED_CODES);
    expect(result.artifact).toBe(artifact);
    expect(result.filled).toEqual([]);
    expect(result.skipped).toBe("no-codes-retrieved");
  });

  it("is a no-op when every list is already populated", () => {
    const artifact: PartialPriorAuthArtifact = {
      requestOverview: {
        treatment: "x",
        cpt: [{ code: "63045", label: "a" }],
        icd10: [{ code: "M54.2", label: "b" }],
        medicalHistory: "",
        keyFindings: [],
      },
      relevantCodes: {
        cpt: [{ code: "63045", label: "a" }],
        icd10: [{ code: "M54.2", label: "b" }],
      },
    };
    expect(backfillArtifactCodes(artifact, codes).artifact).toBe(artifact);
  });

  it("does not fill an artifact with no request to match against", () => {
    const result = backfillArtifactCodes({ title: "x" }, codes);
    expect(result.filled).toEqual([]);
    expect(result.skipped).toBe("source-does-not-match-request");
  });

  it("builds the Relevant Codes section when the artifact lacks one", () => {
    const { artifact } = backfillArtifactCodes(
      { requestOverview: { treatment: "cervical laminectomy" } },
      codes,
    );
    expect(artifact.relevantCodes?.cpt).toEqual(codes.cpt);
  });
});

describe("specificity gate", () => {
  const wide = (n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) => ({ code: `${prefix}${i}`, label: "x" }));
  const names = (n: number) => Array.from({ length: n }, (_, i) => `procedure ${i}`);

  const request = (): PartialPriorAuthArtifact => ({
    requestOverview: {
      treatment: "C2-C5 cervical laminectomy",
      cpt: [],
      icd10: [],
      medicalHistory: "",
      keyFindings: [],
    },
    relevantCodes: { cpt: [], icd10: [] },
  });

  it("refuses a catalog document's grab-bag of codes", () => {
    // The live corpus spine catalog: 16 distinct procedures, 47 CPT spanning
    // disc arthroplasty, kyphoplasty and bone grafts — none a laminectomy.
    const result = backfillArtifactCodes(request(), {
      cpt: wide(47, "2"),
      icd10: [],
      sourceTitle: "Cervical, Thoracic, and Lumbar Spine Surgery",
      sourceProcedures: [
        "cervical disc arthroplasty",
        "lumbar fusion",
        "laminectomy",
        "discectomy",
        "spinal decompression",
        "lumbar disc arthroplasty",
        "lumbar laminectomy",
        "electrical bone growth stimulation",
        "vertebroplasty",
        "kyphoplasty",
        "bone graft substitute",
        "bone morphogenetic protein",
        "dorsal rhizotomy",
        "tethered cord release",
        "anterior lumbar interbody fusion",
        "lateral lumbar interbody fusion",
      ],
    });
    expect(result.filled).toEqual([]);
    expect(result.skipped).toBe("source-not-specific");
  });

  it("accepts a focused document even with a large code list", () => {
    // Why count cannot be the signal: this is one procedure, 39 CPT. The
    // reported defect (Cervical Laminectomy, 25 CPT) failed a count ceiling too.
    const result = backfillArtifactCodes(
      {
        requestOverview: { treatment: "permanent pacemaker implantation", cpt: [], icd10: [] },
        relevantCodes: { cpt: [], icd10: [] },
      },
      {
        cpt: wide(39, "3"),
        icd10: wide(19, "I"),
        sourceTitle: "Permanent Pacemaker Implantation",
        sourceProcedures: [
          "permanent pacemaker implantation",
          "transvenous pacemaker",
          "leadless pacemaker",
          "single-chamber pacemaker implantation",
          "dual-chamber pacemaker implantation",
          "pacemaker generator replacement",
          "pacemaker lead placement",
          "device interrogation",
        ],
      },
    );
    expect(result.filled).toContain("relevantCodes.cpt");
  });

  it("refuses a source with no procedures to judge it by", () => {
    const result = backfillArtifactCodes(request(), {
      cpt: [{ code: "63045", label: "x" }],
      icd10: [],
      sourceTitle: "Cervical Laminectomy",
      sourceProcedures: [],
    });
    expect(result.skipped).toBe("source-not-specific");
  });

  it("refuses one procedure past the ceiling and accepts one at it", () => {
    const at = backfillArtifactCodes(request(), {
      cpt: [{ code: "63045", label: "x" }],
      icd10: [],
      sourceTitle: "Cervical Laminectomy",
      sourceProcedures: [...names(MAX_SOURCE_PROCEDURES - 1), "cervical laminectomy"],
    });
    expect(at.filled).toContain("relevantCodes.cpt");

    const over = backfillArtifactCodes(request(), {
      cpt: [{ code: "63045", label: "x" }],
      icd10: [],
      sourceTitle: "Cervical Laminectomy",
      sourceProcedures: [...names(MAX_SOURCE_PROCEDURES), "cervical laminectomy"],
    });
    expect(over.skipped).toBe("source-not-specific");
  });

  it("refuses a specific document about a different procedure", () => {
    const result = backfillArtifactCodes(request(), {
      cpt: [{ code: "27447", label: "Total knee arthroplasty" }],
      icd10: [],
      sourceTitle: "Total Knee Arthroplasty",
      sourceProcedures: ["total knee arthroplasty", "knee replacement"],
    });
    expect(result.filled).toEqual([]);
    expect(result.skipped).toBe("source-does-not-match-request");
  });
});

describe("sourceMatchesRequest", () => {
  it("matches on a procedure the document covers", () => {
    expect(
      sourceMatchesRequest(
        "Cervical Laminectomy",
        ["cervical laminectomy", "cervical foraminotomy"],
        "C2 to C3 and C4 to C5 laminectomy",
      ),
    ).toBe(true);
    // The title says nothing about foraminotomy; the procedures list does.
    expect(
      sourceMatchesRequest(
        "Cervical Laminectomy",
        ["cervical foraminotomy"],
        "posterior cervical foraminotomy",
      ),
    ).toBe(true);
  });

  it("matches on the diagnosis when the treatment does not", () => {
    expect(
      sourceMatchesRequest("Cervical Spinal Stenosis", [], "posterior decompression", "cervical stenosis"),
    ).toBe(true);
  });

  it("does not match on generic filler alone", () => {
    expect(sourceMatchesRequest("Surgical Treatment Policy", [], "knee surgery")).toBe(false);
    expect(sourceMatchesRequest("Lumbar Fusion", ["lumbar fusion"], "cervical laminectomy")).toBe(
      false,
    );
    // Found running the gate over the real corpus: these shared "imaging".
    expect(
      sourceMatchesRequest(
        "Myocardial Perfusion Imaging",
        ["myocardial perfusion imaging"],
        "Magnetic Resonance Imaging (MRI) of the knee",
      ),
    ).toBe(false);
  });

  it("is false when either side is empty", () => {
    expect(sourceMatchesRequest("", [], "cervical laminectomy")).toBe(false);
    expect(sourceMatchesRequest("Cervical Laminectomy", [], "")).toBe(false);
  });

  it("cannot separate confusable siblings — that is the ranker's job", () => {
    expect(
      sourceMatchesRequest("Lumbar Laminectomy", ["lumbar laminectomy"], "C2-C5 laminectomy"),
    ).toBe(true);
  });
});

describe("code patch frame", () => {
  const codes = extractRetrievedCodes([toolOutput([cervical])]);

  it("round-trips through the wire format", () => {
    const text = '{"kind":"prior-auth-summary"}' + encodeCodePatch(codes);
    const { body, codes: decoded } = splitCodePatch(text);

    expect(body.trim()).toBe('{"kind":"prior-auth-summary"}');
    expect(decoded).toEqual(codes);
  });

  it("passes text through untouched when there is no frame", () => {
    const text = '{"kind":"prior-auth-summary"}';
    expect(splitCodePatch(text)).toEqual({ body: text, codes: null });
  });

  it("degrades to no patch when the frame arrives half-written", () => {
    const text = '{"kind":"x"}\n' + CODE_PATCH_SENTINEL + '{"cpt":[{"co';
    const { body, codes: decoded } = splitCodePatch(text);

    expect(body.trim()).toBe('{"kind":"x"}');
    expect(decoded).toBeNull();
  });

  it("rejects a frame that is not a code payload", () => {
    expect(splitCodePatch("x" + CODE_PATCH_SENTINEL + '{"foo":1}').codes).toBeNull();
  });
});

describe("collectToolOutputs", () => {
  const toolMsg = (name: string, content: unknown) => ({
    _getType: () => "tool",
    name,
    content,
  });

  it("keeps only code-bearing tool messages with string content", () => {
    expect(
      collectToolOutputs([
        { _getType: () => "human", content: "hi" },
        toolMsg("serpapi", "web result"),
        toolMsg("commercial_guidelines_search", "a"),
        toolMsg("commercial_guidelines_search", { not: "a string" }),
        toolMsg("commercial_guidelines_search", "b"),
        null,
      ]),
    ).toEqual(["a", "b"]);
  });
});

describe('parseLabeledCode — separator spacing', () => {
  // An unspaced hyphen joins rather than separates. Splitting an ICD-10 range
  // produced a real code paired with a nonsense descriptor, which then flowed
  // into the report and the evidence index as fact.
  it('keeps an ICD-10 range intact', () => {
    expect(parseLabeledCode('M50.00-M50.93')).toEqual({
      code: 'M50.00-M50.93',
      label: '',
    })
  })

  it('keeps a modifier-bearing CPT intact', () => {
    expect(parseLabeledCode('97110-59')).toEqual({ code: '97110-59', label: '' })
  })

  it('still splits on a spaced hyphen', () => {
    expect(parseLabeledCode('M54.2 - Cervicalgia')).toEqual({
      code: 'M54.2',
      label: 'Cervicalgia',
    })
  })

  it('still splits on an em dash', () => {
    expect(parseLabeledCode('73721 — MRI lower extremity')).toEqual({
      code: '73721',
      label: 'MRI lower extremity',
    })
  })
})
