import { normalizeNoteText } from "../normalize";
import {
  redactPhi,
  redactionReceipt,
  placeholderFor,
  MANUAL_RULE_ID,
} from "../redact";
import type { PhiRule } from "../types";

const N = (s: string) => normalizeNoteText(s);

describe("redactPhi — structured identifiers", () => {
  it("splits a one-line demographics banner into separate fields", () => {
    const r = redactPhi(
      N("Patient: Jane Doe   DOB: 01/02/1970   MRN: 4429301"),
    );
    expect(r.redacted).toBe("Patient: [NAME] DOB: [DOB] MRN: [MRN]");
    expect(r.counts).toEqual({ name: 1, date: 1, mrn: 1 });
    expect(r.total).toBe(3);
  });

  it("removes contact details", () => {
    const r = redactPhi(
      N("Phone: (555) 123-4567 x22\nEmail: jdoe@example.com\nSSN 123-45-6789"),
    );
    expect(r.redacted).not.toMatch(/555|jdoe|example\.com|123-45-6789/);
    expect(r.redacted).toContain("[PHONE]");
    expect(r.redacted).toContain("[EMAIL]");
    expect(r.redacted).toContain("[SSN]");
  });

  it("removes geography below state level but keeps the state", () => {
    const r = redactPhi(N("123 Main Street, Austin, TX 78701"));
    expect(r.redacted).not.toMatch(/Main|Austin|78701/);
  });

  it("removes a facility name", () => {
    const r = redactPhi(N("Seen at Austin Orthopedic Clinic today."));
    expect(r.redacted).toBe("Seen at [FACILITY] today.");
  });

  it("removes an unlabeled long digit run but not a 5-digit CPT code", () => {
    const r = redactPhi(N("Accession 884213907. Requesting CPT 22633."));
    expect(r.redacted).toContain("[ID]");
    expect(r.redacted).toContain("22633");
  });
});

describe("redactPhi — what must survive", () => {
  const note = N(
    [
      "68F with 6 months of low back pain.",
      "Failed PT x8 weeks and NSAIDs x3 months.",
      "MRI shows L4-L5 stenosis, Pfirrmann grade IV, Modic type 2.",
      "Kellgren-Lawrence grade 3. Meyerding grade I slip.",
      "Baker's cyst. Smith fracture healed. h/o Parkinson's disease.",
      "Dx M48.06. Requesting CPT 22633. Right side. No prior lumbar surgery.",
    ].join("\n"),
  );
  const out = redactPhi(note).redacted;

  it.each([
    ["age under 90", "68F"],
    ["symptom duration", "6 months"],
    ["conservative therapy duration", "x8 weeks"],
    ["second therapy duration", "x3 months"],
    ["spinal level", "L4-L5"],
    ["ICD-10 code", "M48.06"],
    ["CPT code", "22633"],
    ["laterality", "Right side"],
    ["prior-surgery status", "No prior lumbar surgery"],
  ])("preserves %s", (_label, fragment) => {
    expect(out).toContain(fragment);
  });

  it.each([
    "Pfirrmann grade IV",
    "Modic type 2",
    "Kellgren-Lawrence grade 3",
    "Meyerding grade I",
  ])("preserves the grading scale %s", (fragment) => {
    expect(out).toContain(fragment);
  });

  it.each(["Baker's cyst", "Smith fracture", "Parkinson's disease"])(
    "preserves the clinical eponym %s",
    (fragment) => {
      expect(out).toContain(fragment);
    },
  );

  it("redacts nothing at all in a note with no identifiers", () => {
    const clean = N("68F with 6 months of low back pain. Failed PT x8 weeks.");
    const r = redactPhi(clean);
    expect(r.redacted).toBe(clean);
    expect(r.total).toBe(0);
    expect(r.spans).toEqual([]);
  });
});

describe("redactPhi — span bookkeeping", () => {
  it("returns sorted, non-overlapping spans in original coordinates", () => {
    const note = N("Patient: Jane Doe   MRN: 4429301   Phone: 555-123-4567");
    const r = redactPhi(note);
    for (let i = 1; i < r.spans.length; i++) {
      expect(r.spans[i].start).toBeGreaterThanOrEqual(r.spans[i - 1].end);
    }
    // Every span's recorded original text is exactly the slice it points at,
    // which is the invariant that lets the preview highlight the right range.
    for (const s of r.spans) {
      expect(note.slice(s.start, s.end)).toBe(s.original);
    }
  });

  it("lets a higher-priority label rule win over the generic digit run", () => {
    const r = redactPhi(N("MRN: 4429301"));
    expect(r.redacted).toBe("MRN: [MRN]");
    expect(r.spans).toHaveLength(1);
    expect(r.spans[0].ruleId).toBe("label-mrn");
  });

  /**
   * Safe Harbor strips geography finer than a state and permits the state
   * itself -- and the Medicare path searches LCD/LCA by MAC jurisdiction, so
   * dropping "TX" would cost the screening a field it needs.
   */
  it("drops the city and ZIP but keeps the state code", () => {
    const r = redactPhi(N("Austin, TX 78701"));
    expect(r.redacted).toBe("[GEO], TX [GEO]");
    expect(r.redacted).toContain("TX");
    expect(r.spans.map((s) => s.original)).toEqual(["Austin", "78701"]);
  });

  it("keeps every span aligned when a rule reports several per match", () => {
    const note = N("Seen in Austin, TX 78701 last week.");
    const r = redactPhi(note);
    for (const s of r.spans) {
      expect(note.slice(s.start, s.end)).toBe(s.original);
    }
  });
});

describe("redactPhi — manual spans", () => {
  it("applies a reviewer's manual span and outranks every rule", () => {
    const note = N("Discussed with the patient's daughter Marisol.");
    const start = note.indexOf("Marisol");
    const r = redactPhi(note, undefined, [
      {
        start,
        end: start + "Marisol".length,
        category: "name",
        ruleId: MANUAL_RULE_ID,
      },
    ]);
    expect(r.redacted).toContain("[NAME]");
    expect(r.redacted).not.toContain("Marisol");
    expect(r.counts.name).toBe(1);
  });
});

describe("redactPhi — resilience", () => {
  it("drops a throwing rule instead of failing open with the raw note", () => {
    const exploding: PhiRule = {
      id: "boom",
      category: "name",
      placeholder: "[NAME]",
      priority: 999,
      find: () => {
        throw new Error("bad rule");
      },
    };
    const working: PhiRule = {
      id: "ssn-only",
      category: "ssn",
      placeholder: "[SSN]",
      priority: 10,
      find: (t) => {
        const i = t.indexOf("123-45-6789");
        return i < 0
          ? []
          : [{ start: i, end: i + 11, category: "ssn", ruleId: "ssn-only" }];
      },
    };
    const r = redactPhi("SSN 123-45-6789", [exploding, working]);
    expect(r.redacted).toBe("SSN [SSN]");
  });

  it("handles empty input", () => {
    const r = redactPhi("");
    expect(r).toEqual({ redacted: "", spans: [], counts: {}, total: 0 });
  });
});

describe("placeholderFor", () => {
  it("maps every category to a bracketed token", () => {
    expect(placeholderFor("name")).toBe("[NAME]");
    expect(placeholderFor("age90")).toBe("[AGE 90+]");
    expect(placeholderFor("device")).toBe("[DEVICE]");
  });
});

describe("redactionReceipt", () => {
  it("counts only, and never names what was removed", () => {
    const r = redactPhi(N("Patient: Jane Doe   MRN: 4429301"));
    const receipt = redactionReceipt(r);
    expect(receipt).toBe("2 identifiers removed from an uploaded note");
    expect(receipt).not.toMatch(/Jane|Doe|4429301/);
  });

  it("singularizes and accepts a custom source", () => {
    const r = redactPhi(N("MRN: 4429301"));
    expect(redactionReceipt(r, "pasted text")).toBe(
      "1 identifier removed from pasted text",
    );
  });

  it("reports zero when nothing was found", () => {
    expect(redactionReceipt(redactPhi("no identifiers here"))).toBe(
      "0 identifiers removed from an uploaded note",
    );
  });
});
