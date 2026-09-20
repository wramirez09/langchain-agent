import {
  extractTextFromFile,
  extractTextFromPaste,
  __setPdfLibLoader,
  UnsupportedFileError,
  FileTooLargeError,
  EmptyTextError,
  MAX_CHARS,
  type PdfLib,
} from "../extractText";

const file = (name: string, body: string, type = "") =>
  new File([body], name, { type });

/** Minimal stand-in for pdfjs: page N yields the Nth entry. */
const fakePdf = (pages: string[][]): PdfLib =>
  ({
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: pages.length,
        getPage: (n: number) =>
          Promise.resolve({
            getTextContent: () =>
              Promise.resolve({ items: pages[n - 1].map((str) => ({ str })) }),
          }),
      }),
    }),
  }) as unknown as PdfLib;

describe("extractTextFromPaste", () => {
  it("takes pasted text as-is", () => {
    const r = extractTextFromPaste("68F with low back pain");
    expect(r).toEqual({
      text: "68F with low back pain",
      kind: "paste",
      truncated: false,
    });
  });

  it("rejects empty input", () => {
    expect(() => extractTextFromPaste("   ")).toThrow(EmptyTextError);
  });

  it("caps very long input and says so", () => {
    const r = extractTextFromPaste("x".repeat(MAX_CHARS + 500));
    expect(r.text).toHaveLength(MAX_CHARS);
    expect(r.truncated).toBe(true);
  });
});

describe("extractTextFromFile — plain text", () => {
  it("reads a .txt file", async () => {
    const r = await extractTextFromFile(file("note.txt", "Failed PT x8 weeks"));
    expect(r).toEqual({
      text: "Failed PT x8 weeks",
      kind: "txt",
      truncated: false,
    });
  });

  it("reads a file by MIME type when the name has no extension", async () => {
    const r = await extractTextFromFile(file("note", "abc", "text/plain"));
    expect(r.kind).toBe("txt");
  });

  it("flattens markdown to plain text", async () => {
    const r = await extractTextFromFile(
      file("note.md", "# Assessment\n\n**Failed** PT x8 weeks"),
    );
    expect(r.kind).toBe("md");
    expect(r.text).toContain("Failed PT x8 weeks");
    expect(r.text).not.toContain("**");
    expect(r.text).not.toContain("#");
  });

  it("rejects an empty file", async () => {
    await expect(extractTextFromFile(file("note.txt", "   "))).rejects.toThrow(
      EmptyTextError,
    );
  });
});

describe("extractTextFromFile — rejections", () => {
  it("rejects a file over 10MB before reading it", async () => {
    const big = file("note.txt", "x");
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    await expect(extractTextFromFile(big)).rejects.toThrow(FileTooLargeError);
  });

  /** Both are planned, so the message says so rather than "unsupported". */
  it("names Word documents and images specifically", async () => {
    await expect(extractTextFromFile(file("n.docx", "x"))).rejects.toThrow(
      /Word documents is not supported yet/,
    );
    await expect(
      extractTextFromFile(file("n.png", "x", "image/png")),
    ).rejects.toThrow(/Images is not supported yet/);
  });

  it("rejects an unknown type", async () => {
    await expect(
      extractTextFromFile(file("n.zip", "x", "application/zip")),
    ).rejects.toThrow(UnsupportedFileError);
  });
});

describe("extractTextFromFile — pdf", () => {
  const pdf = (body = "%PDF-1.4") => file("note.pdf", body, "application/pdf");

  it("joins text items within a page and pages with a blank line", async () => {
    __setPdfLibLoader(async () =>
      fakePdf([["68F", "with", "low back pain"], ["Failed PT x8 weeks"]]),
    );
    const r = await extractTextFromFile(pdf());
    expect(r.text).toBe("68F with low back pain\n\nFailed PT x8 weeks");
    expect(r.kind).toBe("pdf");
    expect(r.pages).toBe(2);
  });

  it("skips pages that contain nothing", async () => {
    __setPdfLibLoader(async () => fakePdf([["page one"], [], ["page three"]]));
    const r = await extractTextFromFile(pdf());
    expect(r.text).toBe("page one\n\npage three");
    expect(r.pages).toBe(3);
  });

  /**
   * A scan has no text layer. Handing an empty string down the pipeline would
   * surface later as "no fields found" and read like the note was at fault.
   */
  it("says plainly when a PDF is a scan with no text layer", async () => {
    __setPdfLibLoader(async () => fakePdf([[], []]));
    await expect(extractTextFromFile(pdf())).rejects.toThrow(
      /no selectable text/i,
    );
  });

  it("caps a very long PDF", async () => {
    __setPdfLibLoader(async () => fakePdf([["y".repeat(MAX_CHARS + 500)]]));
    const r = await extractTextFromFile(pdf());
    expect(r.text).toHaveLength(MAX_CHARS);
    expect(r.truncated).toBe(true);
  });

  it("detects a pdf by extension even with no MIME type", async () => {
    __setPdfLibLoader(async () => fakePdf([["ok"]]));
    const r = await extractTextFromFile(file("note.PDF", "x"));
    expect(r.kind).toBe("pdf");
  });
});
