import { isClinicalEponym, foldToken, __eponymSets } from "../eponyms";

describe("foldToken", () => {
  it("lowercases, strips the possessive, and drops punctuation", () => {
    expect(foldToken("Baker's")).toBe("baker");
    expect(foldToken("SMITH,")).toBe("smith");
    expect(foldToken("Hill-Sachs")).toBe("hill-sachs");
  });

  it("folds diacritics so both spellings resolve", () => {
    // Composed and decomposed forms of the accented spelling.
    const composed = "Sjögren";
    const decomposed = "Sjögren";
    expect(foldToken(composed)).toBe("sjogren");
    expect(foldToken(decomposed)).toBe("sjogren");
  });

  it("returns empty for non-name input", () => {
    expect(foldToken("1970")).toBe("");
    expect(foldToken("")).toBe("");
  });
});

describe("isClinicalEponym — unconditional tier", () => {
  it.each([
    ["Parkinson", "'s disease"],
    ["Crohn", "'s disease"],
    ["Dupuytren", " contracture"],
    ["Raynaud", " phenomenon"],
    ["Colles", " fracture"],
    ["Achilles", " tendon rupture"],
    ["Lachman", " negative"],
  ])("keeps %s", (token, after) => {
    expect(isClinicalEponym(token, after)).toBe(true);
  });

  it("keeps an unconditional eponym even with no qualifier after it", () => {
    // "h/o Dupuytren" with nothing following still must not be redacted.
    expect(isClinicalEponym("Dupuytren", "")).toBe(true);
    expect(isClinicalEponym("Sjogren", " and dry eye")).toBe(true);
  });

  it("handles the hyphenated compound spelling", () => {
    expect(isClinicalEponym("Hill-Sachs", " lesion")).toBe(true);
  });
});

describe("isClinicalEponym — context-gated tier", () => {
  it("keeps a common surname when it is used as a medical term", () => {
    expect(isClinicalEponym("Smith", " fracture of the distal radius")).toBe(
      true,
    );
    expect(isClinicalEponym("Baker", "'s cyst")).toBe(true);
    expect(isClinicalEponym("Bell", "'s palsy")).toBe(true);
    expect(isClinicalEponym("Jones", " fracture")).toBe(true);
    expect(isClinicalEponym("Graves", " disease")).toBe(true);
    expect(isClinicalEponym("Weber", " B ankle fracture")).toBe(false);
  });

  it("redacts the same surname when it is a person", () => {
    expect(isClinicalEponym("Smith", ", MD")).toBe(false);
    expect(isClinicalEponym("Baker", " reports worsening pain")).toBe(false);
    expect(isClinicalEponym("Jones", " was seen in clinic")).toBe(false);
    expect(isClinicalEponym("Bell", " and his daughter")).toBe(false);
  });

  /**
   * Regression guard. These are eponyms AND very common US given names or
   * surnames. Treating them as unconditionally safe would leave a real
   * patient's name in text we are about to send to OpenAI.
   */
  it.each([
    "Thomas",
    "Patrick",
    "Marie",
    "Cooper",
    "Jefferson",
    "Hawkins",
    "Bennett",
    "Morton",
    "Willis",
    "Lister",
  ])("does not unconditionally keep the common name %s", (token) => {
    expect(isClinicalEponym(token, " Reyes, seen today")).toBe(false);
    expect(__eponymSets.ALWAYS.has(token.toLowerCase())).toBe(false);
  });

  it("still keeps those names in genuine clinical use", () => {
    expect(isClinicalEponym("Thomas", " test positive")).toBe(true);
    expect(isClinicalEponym("Cooper", "'s ligament")).toBe(true);
    expect(isClinicalEponym("Morton", " neuroma")).toBe(true);
  });
});

describe("isClinicalEponym — everything else", () => {
  it("is false for names that are not eponyms at all", () => {
    expect(isClinicalEponym("Rodriguez", " fracture")).toBe(false);
    expect(isClinicalEponym("Nakamura", "'s disease")).toBe(false);
    expect(isClinicalEponym("", " disease")).toBe(false);
  });

  it("keeps the two tiers disjoint", () => {
    const both = [...__eponymSets.ALWAYS].filter((t) =>
      __eponymSets.IN_USE.has(t),
    );
    expect(both).toEqual([]);
  });
});
