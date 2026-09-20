/**
 * Text normalization that has to happen before any detection rule runs.
 *
 * Every downstream regex assumes ordinary ASCII punctuation and single spaces.
 * The text we get does not look like that: `pdfjs` emits non-breaking spaces
 * and soft hyphens, Word documents carry smart quotes and en-dashes, OCR adds
 * zero-width junk, and both PDF and OCR break words across line ends. A phone
 * number written with non-breaking spaces, or an `MRN` split by a soft hyphen,
 * slips past a rule that would otherwise catch it -- which is a privacy bug,
 * not a cosmetic one, so this runs first and unconditionally.
 *
 * Line structure is deliberately PRESERVED. The label-anchored rules read a
 * value "to end of line", and clinical notes put the demographics banner and
 * the signature block on their own lines; flattening newlines would destroy
 * the highest-precision signal we have.
 *
 * NOTE: every non-ASCII character below is written as a numeric code point and
 * assembled at runtime. Keeping this source pure ASCII means the confusable
 * characters cannot be silently mangled by an editor, a copy-paste, or a tool
 * that normalizes unicode escapes -- which for a privacy filter would be a
 * failure you could not see by reading the diff.
 */

const chars = (...codes: number[]): string =>
  codes.map((c) => String.fromCharCode(c)).join("");

const range = (from: number, to: number): number[] => {
  const out: number[] = [];
  for (let c = from; c <= to; c++) out.push(c);
  return out;
};

const classOf = (codes: number[]): RegExp =>
  new RegExp("[" + chars(...codes) + "]", "g");

/** Characters that render as a space but do not match `\s` in every engine. */
const SPACEY = classOf([
  0x00a0, // no-break space
  0x1680, // ogham space mark
  ...range(0x2000, 0x200a), // en/em quad through hair space
  0x202f, // narrow no-break space
  0x205f, // medium mathematical space
  0x3000, // ideographic space
]);

/**
 * Zero-width, bidi and line-separator controls -- pure noise from OCR and
 * copy-paste, and a trivial way to split a token past a regex.
 */
const INVISIBLE = classOf([
  0x00ad, // soft hyphen
  0x200b, // zero-width space
  0x200c, // zero-width non-joiner
  0x200d, // zero-width joiner
  0x200e, // left-to-right mark
  0x200f, // right-to-left mark
  0x2028, // line separator
  0x2029, // paragraph separator
  0xfeff, // byte-order mark
]);

const QUOTES: Array<[RegExp, string]> = [
  // Single quotes and prime.
  [classOf([0x2018, 0x2019, 0x201a, 0x201b, 0x2032]), "'"],
  // Double quotes and double prime.
  [classOf([0x201c, 0x201d, 0x201e, 0x201f, 0x2033]), '"'],
  // Hyphen/dash family and minus sign.
  [classOf([...range(0x2010, 0x2015), 0x2212]), "-"],
  // Horizontal ellipsis.
  [classOf([0x2026]), "..."],
];

/**
 * Re-join a word split across a line break by hyphenation, e.g. a PDF that
 * wrapped "Rodri-\nguez" or an MRN broken mid-token. Only joins when both
 * sides are word characters, so a genuine list item ("- NSAIDs") is left alone.
 */
function rejoinHyphenBreaks(text: string): string {
  return text.replace(/(\w)-[ \t]*\r?\n[ \t]*(\w)/g, "$1$2");
}

/**
 * Normalize for detection. Returns text whose offsets are the coordinate space
 * every `PhiSpan` refers to -- so callers must normalize ONCE, up front, and
 * then pass the result to both `redactPhi` and the preview UI.
 */
export function normalizeNoteText(raw: string): string {
  let out = raw.normalize("NFKC");
  out = out.replace(INVISIBLE, "");
  out = out.replace(SPACEY, " ");
  for (const [re, to] of QUOTES) out = out.replace(re, to);
  out = rejoinHyphenBreaks(out);
  // Collapse runs of spaces/tabs, but never across a newline.
  out = out.replace(/[ \t]{2,}/g, " ");
  // Normalize line endings and cap runs of blank lines.
  out = out.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n");
  return out.trim();
}
