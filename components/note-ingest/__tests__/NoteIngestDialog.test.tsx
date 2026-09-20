// The factory is evaluated when `sonner` is first imported, which is before a
// `const` in this file initialises -- so the mock has to call through an arrow
// rather than reference the object directly.
const toastMock = { warning: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock("sonner", () => ({
  toast: {
    warning: (...a: unknown[]) => toastMock.warning(...a),
    error: (...a: unknown[]) => toastMock.error(...a),
    info: (...a: unknown[]) => toastMock.info(...a),
  },
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NoteIngestDialog } from "../NoteIngestDialog";

const NOTE = [
  "Patient: Jane Doe   DOB: 01/02/1970   MRN: 4429301",
  "68F with 6 months of low back pain. Failed PT x8 weeks.",
  "Dx M48.06. Requesting CPT 22633. Aetna. Texas.",
].join("\n");

const noteFile = (body = NOTE, name = "note.txt") =>
  new File([body], name, { type: "text/plain" });

const fetchMock = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock as never;
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ query: "Guidelines: Commercial. State: Texas" }),
  });
});

/**
 * Open the dialog and put `file` on its dropzone the way a user would.
 * react-dropzone listens for a real change event, so `userEvent.upload` is
 * required -- a bare fireEvent.change never reaches its onDrop.
 */
const openWith = async (
  file: File | null,
  onReady = jest.fn(),
  onClose = jest.fn(),
) => {
  render(<NoteIngestDialog open onClose={onClose} onReady={onReady} />);
  if (file) {
    // The dialog renders through a Radix portal, so the input is in the
    // document but NOT under the render container.
    const input = screen
      .getByTestId("note-dropzone")
      .querySelector("input[type=file]") as HTMLElement;
    await userEvent.upload(input, file);
  }
  return { onReady, onClose };
};

describe("NoteIngestDialog — review", () => {
  it("shows the de-identified note, not the original", async () => {
    await openWith(noteFile());
    await screen.findByTestId("redacted-preview");
    const preview = screen.getByTestId("redacted-preview");
    expect(preview.textContent).not.toMatch(/Jane Doe|4429301|01\/02\/1970/);
    expect(preview.textContent).toContain("Failed PT x8 weeks");
  });

  it("marks each removal with its category", async () => {
    await openWith(noteFile());
    await screen.findByTestId("redacted-preview");
    const cats = screen
      .getAllByTestId("redaction-chip")
      .map((c) => c.getAttribute("data-category"));
    expect(cats).toEqual(expect.arrayContaining(["name", "date", "mrn"]));
  });

  it("summarises how many identifiers were removed", async () => {
    await openWith(noteFile());
    expect(await screen.findByText(/identifiers removed/)).toBeInTheDocument();
  });

  it("says the note has not been sent yet", async () => {
    await openWith(noteFile());
    expect(
      await screen.findByText(/Nothing has been sent yet/),
    ).toBeInTheDocument();
  });
});

describe("NoteIngestDialog — the confirm gate", () => {
  it("keeps the button disabled until the box is ticked", async () => {
    const user = userEvent.setup();
    await openWith(noteFile());
    await screen.findByTestId("redacted-preview");

    const send = screen.getByRole("button", { name: /use this note/i });
    expect(send).toBeDisabled();

    await user.click(screen.getByRole("checkbox"));
    expect(send).toBeEnabled();
  });

  it("sends nothing while the box is unticked", async () => {
    const user = userEvent.setup();
    await openWith(noteFile());
    await screen.findByTestId("redacted-preview");
    await user.click(screen.getByRole("button", { name: /use this note/i }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts only the redacted text, never the original", async () => {
    const user = userEvent.setup();
    const { onReady } = await openWith(noteFile());
    await screen.findByTestId("redacted-preview");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /use this note/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/notes/extract");
    const body = JSON.parse(init.body);
    expect(body.text).not.toMatch(/Jane Doe|4429301/);
    expect(body.sourceKind).toBe("txt");
    expect(body.redactionCount).toBeGreaterThan(0);
    await waitFor(() =>
      expect(onReady).toHaveBeenCalledWith(
        "Guidelines: Commercial. State: Texas",
      ),
    );
  });
});

describe("NoteIngestDialog — failures", () => {
  it("explains a scanned PDF instead of failing silently", async () => {
    await openWith(new File(["x"], "scan.pdf", { type: "application/pdf" }));
    expect(await screen.findByTestId("ingest-error")).toBeInTheDocument();
  });

  it("warns and stays open when the server tripwire fires", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "PHI_DETECTED", categories: { ssn: 1 } }),
    });
    const { onReady, onClose } = await openWith(noteFile());
    await screen.findByTestId("redacted-preview");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /use this note/i }));

    await waitFor(() => expect(toastMock.warning).toHaveBeenCalled());
    expect(onReady).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("reports a note nothing could be read from", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "NO_FIELDS_EXTRACTED" }),
    });
    await openWith(noteFile());
    await screen.findByTestId("redacted-preview");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /use this note/i }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
  });

  it("opens on the dropzone before a file is chosen", async () => {
    await openWith(null);
    expect(screen.getByTestId("note-dropzone")).toBeInTheDocument();
    expect(screen.queryByTestId("redacted-preview")).toBeNull();
  });
});
