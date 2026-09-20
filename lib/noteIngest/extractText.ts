/**
 * File -> text, ENTIRELY IN THE BROWSER.
 *
 * This is the half of the note pipeline that makes the rest of it honest.
 * `documents/privacy-policy.md` disclaims Business Associate status, so a
 * clinical note must be de-identified before it crosses the network -- which
 * is only possible if the bytes are turned into text on the device. Nothing
 * here may fetch, upload, or touch a server.
 *
 * Every parser is lazily imported so none of it lands in the main bundle; a
 * user who never attaches a file never downloads a PDF engine.
 */

export type SourceKind = "txt" | "md" | "paste" | "pdf" | "docx" | "image";

export interface ExtractedText {
  text: string;
  kind: SourceKind;
  /** Page count, for PDFs only. */
  pages?: number;
  /** True when the output hit `MAX_CHARS` and lost its tail. */
  truncated: boolean;
}

/** Matches the server's cap in `app/api/notes/extract/route.ts`. */
export const MAX_CHARS = 50_000;
export const MAX_BYTES = 10 * 1024 * 1024;

export class UnsupportedFileError extends Error {
  constructor(what: string) {
    super(
      `${what} is not supported yet. Attach a .txt, .md or .pdf file, or paste the note directly.`,
    );
    this.name = "UnsupportedFileError";
  }
}

export class FileTooLargeError extends Error {
  constructor() {
    super("That file is larger than 10MB. Attach a smaller file.");
    this.name = "FileTooLargeError";
  }
}

export class EmptyTextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmptyTextError";
  }
}

function cap(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_CHARS), truncated: true };
}

/* ------------------------------------------------------------------ */
/* pdf                                                                 */
/* ------------------------------------------------------------------ */

type PdfTextItem = { str?: string };
type PdfPage = { getTextContent: () => Promise<{ items: PdfTextItem[] }> };
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
export type PdfLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PdfDoc> };
};

/**
 * Lazily pull in pdfjs and point it at its worker. Swappable so the extraction
 * logic can be tested without running a PDF engine under jsdom -- the parsing
 * is pdfjs's problem, the page-joining and empty-text handling are ours, and
 * only the latter is worth a test.
 */
let loadPdfLib: () => Promise<PdfLib> = async () => {
  const pdfjs = (await import(
    /* webpackChunkName: "pdfjs" */ "pdfjs-dist"
  )) as unknown as PdfLib;
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  return pdfjs;
};

/** Test seam. */
export function __setPdfLibLoader(loader: () => Promise<PdfLib>) {
  loadPdfLib = loader;
}

async function extractPdf(file: File): Promise<ExtractedText> {
  const pdfjs = await loadPdfLib();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() })
    .promise;

  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(
      content.items
        .map((i) => i.str ?? "")
        .join(" ")
        .trim(),
    );
  }

  const joined = pages.filter(Boolean).join("\n\n");

  // A scanned or photographed PDF has no text layer and yields nothing. Say
  // so plainly rather than handing an empty string down the pipeline, where it
  // would surface as "we found no fields" and read like the note was the
  // problem. OCR is deliberately not in scope yet.
  if (!joined.trim()) {
    throw new EmptyTextError(
      "That PDF has no selectable text - it looks like a scan or a photo. Paste the note as text instead.",
    );
  }

  const { text, truncated } = cap(joined);
  return { text, kind: "pdf", pages: doc.numPages, truncated };
}

/* ------------------------------------------------------------------ */
/* entry points                                                        */
/* ------------------------------------------------------------------ */

function kindOf(file: File): SourceKind | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "md";
  if (name.endsWith(".txt") || file.type.startsWith("text/")) return "txt";
  if (name.endsWith(".docx") || name.endsWith(".doc")) return "docx";
  if (file.type.startsWith("image/")) return "image";
  return null;
}

export async function extractTextFromFile(file: File): Promise<ExtractedText> {
  if (file.size > MAX_BYTES) throw new FileTooLargeError();

  const kind = kindOf(file);
  if (kind === null) throw new UnsupportedFileError("That file type");
  // Both are planned; neither ships in this pass. An explicit message beats a
  // generic "unsupported" that leaves the user guessing whether it will ever
  // work.
  if (kind === "docx") throw new UnsupportedFileError("Word documents");
  if (kind === "image") throw new UnsupportedFileError("Images");

  if (kind === "pdf") return extractPdf(file);

  const raw = await file.text();
  const body =
    kind === "md" ? (await import("markdown-to-txt")).markdownToTxt(raw) : raw;

  if (!body.trim()) {
    throw new EmptyTextError("That file is empty.");
  }

  const { text, truncated } = cap(body);
  return { text, kind, truncated };
}

export function extractTextFromPaste(input: string): ExtractedText {
  if (!input.trim()) throw new EmptyTextError("Paste the note text first.");
  const { text, truncated } = cap(input);
  return { text, kind: "paste", truncated };
}
