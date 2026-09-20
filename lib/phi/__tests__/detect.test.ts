import { normalizeNoteText } from "../normalize";
import { redactPhi } from "../redact";
import { detectPhi, blockingFindings, residueSummary } from "../detect";

const N = (s: string) => normalizeNoteText(s);

describe("detectPhi", () => {
  it("finds nothing in a properly redacted note", () => {
    const t = N(
      "Patient: Jane Doe\nMRN: 4429301\nSSN 123-45-6789\nPhone: (555) 123-4567\n68F, L4-L5 stenosis, CPT 22633, ICD M48.06, failed PT x8 weeks.",
    );
    const findings = detectPhi(redactPhi(t).redacted);
    expect(blockingFindings(findings)).toEqual([]);
  });

  it("catches text that skipped redaction entirely", () => {
    const raw =
      "Patient Jane Doe SSN 123-45-6789 call 555-123-4567 jd@x.com MRN 4429301";
    const blocking = blockingFindings(detectPhi(raw));
    expect(blocking.length).toBeGreaterThanOrEqual(4);
    expect(new Set(blocking.map((f) => f.category))).toEqual(
      new Set(["ssn", "phone", "email", "mrn"]),
    );
  });

  it.each([
    ["an SSN", "123-45-6789", "ssn"],
    ["an email", "a.b@c.org", "email"],
    ["a phone number", "(555) 123-4567", "phone"],
    ["a nine-digit run", "884213907", "account"],
    ["a numeric date", "10/14/2024", "date"],
  ])("blocks on %s", (_label, text, category) => {
    const f = blockingFindings(detectPhi(`residual ${text} here`));
    expect(f.map((x) => x.category)).toContain(category);
  });

  it("blocks when digits still sit next to an identifier label", () => {
    const f = blockingFindings(detectPhi("MRN 4429301"));
    expect(f.some((x) => x.ruleId === "residue-labelled-id")).toBe(true);
  });

  it("does not block on clinical content that merely looks numeric", () => {
    const clean = "68F, L4-L5, CPT 22633, ICD M48.06, PT x8 weeks, BP 120/80";
    expect(blockingFindings(detectPhi(clean))).toEqual([]);
  });

  it("reports a URL without blocking on it", () => {
    const f = detectPhi("see www.example.com/policy");
    expect(f.some((x) => x.category === "url")).toBe(true);
    expect(blockingFindings(f)).toEqual([]);
  });

  it("returns findings sorted by position", () => {
    const f = detectPhi("a@b.com then 123-45-6789 then 555-123-4567");
    for (let i = 1; i < f.length; i++) {
      expect(f[i].start).toBeGreaterThanOrEqual(f[i - 1].start);
    }
  });
});

describe("residueSummary", () => {
  // This is the ONLY residue shape allowed into a response body or a log, so
  // it must be counts and nothing else.
  it("emits counts only, never the matched text", () => {
    const summary = residueSummary(
      detectPhi("SSN 123-45-6789 and jane.doe@example.com"),
    );
    expect(JSON.stringify(summary)).not.toMatch(/123|jane|example/);
    expect(summary.ssn).toBe(1);
    expect(summary.email).toBe(1);
  });

  it("is empty for clean text", () => {
    expect(residueSummary(detectPhi("68F with low back pain"))).toEqual({});
  });
});
