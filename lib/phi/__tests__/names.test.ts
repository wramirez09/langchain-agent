import { normalizeNoteText } from "../normalize";
import { redactPhi } from "../redact";
import { NAME_RULES, findSuspectNames } from "../names";

const N = (s: string) => normalizeNoteText(s);

describe("anchored name rules — hard redaction", () => {
  it.each([
    ["Dr. Reyes", "Discussed with Dr. Reyes today."],
    ["Dr without a period", "Seen by Dr Anita Reyes in clinic."],
    ["Mrs. with apostrophe", "Mrs. O'Brien was notified."],
  ])("redacts an honorific-anchored name (%s)", (_label, text) => {
    const out = redactPhi(N(text)).redacted;
    expect(out).toContain("[NAME]");
    expect(out).not.toMatch(/Reyes|O'Brien|Anita/);
  });

  it("keeps the honorific itself so the sentence still reads", () => {
    expect(redactPhi(N("Discussed with Dr. Reyes.")).redacted).toBe(
      "Discussed with Dr. [NAME].",
    );
  });

  it.each([
    "Electronically signed by: Robert Nguyen, MD",
    "Reviewed by A. Reyes, PA-C",
    "Dictated by: Maria Santos-Lopez, RN",
  ])("redacts a credential-anchored name (%s)", (text) => {
    const out = redactPhi(N(text)).redacted;
    expect(out).toContain("[NAME]");
    expect(out).not.toMatch(/Nguyen|Reyes|Santos|Lopez|Robert|Maria/);
  });

  it("redacts a cc: distribution line", () => {
    const out = redactPhi(N("cc: Robert Nguyen, Anita Reyes")).redacted;
    expect(out).not.toMatch(/Nguyen|Reyes/);
  });

  it("exposes its rules for composition", () => {
    expect(NAME_RULES.map((r) => r.id)).toEqual([
      "name-honorific",
      "name-credential",
    ]);
  });
});

describe("findSuspectNames — soft flags", () => {
  const flags = (s: string) => {
    const t = N(s);
    const r = redactPhi(t);
    return findSuspectNames(t, r.spans).map((f) => f.text);
  };

  it("flags an unanchored relative's name without redacting it", () => {
    const t = N("Discussed with the patient's daughter Marisol.");
    const r = redactPhi(t);
    expect(r.redacted).toContain("Marisol");
    expect(findSuspectNames(t, r.spans).map((f) => f.text)).toContain(
      "Marisol",
    );
  });

  it("does not flag clinical vocabulary or section headings", () => {
    expect(
      flags("Assessment: Chronic low back pain. Plan: Continue PT."),
    ).toEqual([]);
  });

  it("does not flag grading scales — the whole reason the sweep was dropped", () => {
    expect(
      flags("MRI: Pfirrmann grade IV, Modic type 2, Kellgren-Lawrence 3."),
    ).toEqual([]);
  });

  it("does not flag clinical eponyms", () => {
    expect(flags("Noted Baker's cyst and a healed Smith fracture.")).toEqual(
      [],
    );
  });

  it("does not flag payers", () => {
    expect(flags("Coverage: Aetna Commercial plan.")).toEqual([]);
  });

  it("does not flag the honorific or a field label", () => {
    const f = flags("Email: x@y.com\nSeen by Dr. Reyes.");
    expect(f).not.toContain("Email");
    expect(f).not.toContain("Dr");
  });

  it("does not double-flag a token already redacted", () => {
    const t = N("Patient: Jane Doe");
    const r = redactPhi(t);
    expect(findSuspectNames(t, r.spans)).toEqual([]);
  });

  it("skips sentence-initial words", () => {
    expect(flags("Patient improved. Repeat imaging ordered.")).toEqual([]);
  });

  it("returns offsets that point at the flagged token", () => {
    const t = N("Spoke with her son Diego about the plan.");
    const f = findSuspectNames(t, []);
    const diego = f.find((x) => x.text === "Diego");
    expect(diego).toBeDefined();
    expect(t.slice(diego!.start, diego!.end)).toBe("Diego");
    expect(diego!.reason).toBe("suspect-name");
  });
});
