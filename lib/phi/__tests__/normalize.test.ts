import { normalizeNoteText } from "../normalize";

// Source stays pure ASCII for the same reason `normalize.ts` does: a literal
// zero-width character in a test file is invisible in review and in a diff, so
// a broken assertion would look correct. Build them explicitly instead.
const ch = (code: number) => String.fromCharCode(code);

const NBSP = ch(0x00a0);
const SOFT_HYPHEN = ch(0x00ad);
const ZWSP = ch(0x200b);
const BOM = ch(0xfeff);
const LSEP = ch(0x2028);
const RSQUO = ch(0x2019);
const LDQUO = ch(0x201c);
const RDQUO = ch(0x201d);
const ENDASH = ch(0x2013);
const ELLIPSIS = ch(0x2026);
const IDEOGRAPHIC_SPACE = ch(0x3000);

describe("normalizeNoteText", () => {
  it("leaves ordinary clinical text alone", () => {
    const text = "Pt reports 6 months of low back pain.\nFailed PT x8 weeks.";
    expect(normalizeNoteText(text)).toBe(text);
  });

  it("turns non-breaking and exotic spaces into plain spaces", () => {
    expect(normalizeNoteText(`555${NBSP}123${NBSP}4567`)).toBe("555 123 4567");
    expect(normalizeNoteText(`MRN${IDEOGRAPHIC_SPACE}4429301`)).toBe(
      "MRN 4429301",
    );
  });

  // The privacy-relevant case: an invisible character mid-token defeats a
  // regex that would otherwise match the identifier.
  it("strips invisible characters that would split a token", () => {
    expect(normalizeNoteText(`MR${SOFT_HYPHEN}N 4429301`)).toBe("MRN 4429301");
    expect(normalizeNoteText(`123${ZWSP}-45${ZWSP}-6789`)).toBe("123-45-6789");
    expect(normalizeNoteText(`${BOM}Patient: Jane Doe`)).toBe(
      "Patient: Jane Doe",
    );
  });

  it("removes line/paragraph separators that are not real newlines", () => {
    expect(normalizeNoteText(`a${LSEP}b`)).toBe("ab");
  });

  it("folds smart punctuation to ASCII", () => {
    expect(normalizeNoteText(`Baker${RSQUO}s cyst`)).toBe("Baker's cyst");
    expect(normalizeNoteText(`${LDQUO}severe${RDQUO} pain`)).toBe(
      '"severe" pain',
    );
    expect(normalizeNoteText(`L4${ENDASH}L5`)).toBe("L4-L5");
    expect(normalizeNoteText(`and so on${ELLIPSIS}`)).toBe("and so on...");
  });

  it("rejoins a word hyphen-broken across a line", () => {
    expect(normalizeNoteText("Rodri-\nguez")).toBe("Rodriguez");
    expect(normalizeNoteText("MR-\n  N 4429301")).toBe("MRN 4429301");
  });

  it("does not eat a hyphen that starts a list item", () => {
    expect(normalizeNoteText("Meds:\n- NSAIDs\n- PT")).toBe(
      "Meds:\n- NSAIDs\n- PT",
    );
  });

  it("preserves line structure, which the label rules depend on", () => {
    const banner = "Patient: Jane Doe\nDOB: 01/02/1970\nMRN: 4429301";
    expect(normalizeNoteText(banner)).toBe(banner);
  });

  it("collapses horizontal whitespace runs without merging lines", () => {
    expect(normalizeNoteText("Name:    Jane\t\tDoe")).toBe("Name: Jane Doe");
    expect(normalizeNoteText("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  it("normalizes CRLF and trims the result", () => {
    expect(normalizeNoteText("  a\r\nb\r\n  ")).toBe("a\nb");
  });

  it("handles empty and whitespace-only input", () => {
    expect(normalizeNoteText("")).toBe("");
    expect(normalizeNoteText(`   ${NBSP}\n\n  `)).toBe("");
  });

  it("is idempotent", () => {
    const messy = `Patient:${NBSP}Jane${ZWSP} Doe${RSQUO}s note\r\nMR${SOFT_HYPHEN}N 1`;
    const once = normalizeNoteText(messy);
    expect(normalizeNoteText(once)).toBe(once);
  });
});
