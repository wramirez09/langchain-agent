import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileUpload } from "../FileUpload";

const txt = (name = "note.txt") =>
  new File(["68F with low back pain"], name, { type: "text/plain" });

describe("FileUpload", () => {
  it("invites the user to attach a note", () => {
    render(<FileUpload onFile={jest.fn()} />);
    expect(screen.getByText("Attach a clinical note")).toBeInTheDocument();
    expect(screen.getByText("PDF, TXT or MD (max 10MB)")).toBeInTheDocument();
  });

  it("reports the picked file", async () => {
    const user = userEvent.setup();
    const onFile = jest.fn();
    const { container } = render(<FileUpload onFile={onFile} />);
    const input = container.querySelector("input[type=file]")!;

    await user.upload(input as HTMLElement, txt());
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile.mock.calls[0][0].name).toBe("note.txt");
  });

  /**
   * It hands back the File and stops. Parsing and de-identification happen in
   * NoteIngestDialog, so there is exactly one place a note's contents are
   * touched.
   */
  it("does not read the file itself", async () => {
    const user = userEvent.setup();
    const file = txt();
    const textSpy = jest.spyOn(file, "text");
    const { container } = render(<FileUpload onFile={jest.fn()} />);
    await user.upload(
      container.querySelector("input[type=file]") as HTMLElement,
      file,
    );
    expect(textSpy).not.toHaveBeenCalled();
  });

  it("accepts a custom hint", () => {
    render(<FileUpload onFile={jest.fn()} hint="Just text for now" />);
    expect(screen.getByText("Just text for now")).toBeInTheDocument();
  });

  it("can be disabled", () => {
    render(<FileUpload onFile={jest.fn()} disabled />);
    expect(screen.getByTestId("note-dropzone").className).toMatch(
      /cursor-not-allowed/,
    );
  });

  it("shows no error until something is rejected", () => {
    render(<FileUpload onFile={jest.fn()} />);
    expect(screen.queryByTestId("dropzone-error")).toBeNull();
  });

  /**
   * Dropping is the only way to exercise rejection: `userEvent.upload` honours
   * the input's `accept` and silently discards a non-matching file, so onDrop
   * never runs.
   */
  const drop = (file: File) =>
    fireEvent.drop(screen.getByTestId("note-dropzone"), {
      dataTransfer: {
        files: [file],
        items: [{ kind: "file", type: file.type, getAsFile: () => file }],
        types: ["Files"],
      },
    });

  it("rejects an unsupported type without reading it", async () => {
    const onFile = jest.fn();
    const bad = new File(["x"], "note.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const textSpy = jest.spyOn(bad, "text");
    render(<FileUpload onFile={onFile} />);
    drop(bad);

    expect(await screen.findByTestId("dropzone-error")).toHaveTextContent(
      /PDF, .txt or .md/,
    );
    expect(onFile).not.toHaveBeenCalled();
    expect(textSpy).not.toHaveBeenCalled();
  });

  it("rejects a file over the size limit", async () => {
    const big = new File(["x"], "note.txt", { type: "text/plain" });
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    render(<FileUpload onFile={jest.fn()} />);
    drop(big);
    expect(await screen.findByTestId("dropzone-error")).toHaveTextContent(
      /larger than 10MB/,
    );
  });

  it("clears the error once an acceptable file arrives", async () => {
    const onFile = jest.fn();
    render(<FileUpload onFile={onFile} />);
    drop(new File(["x"], "n.docx", { type: "application/msword" }));
    await screen.findByTestId("dropzone-error");

    drop(txt());
    // "Attach a clinical note" is always on screen, so waiting on it would
    // resolve before React flushed the drop.
    await waitFor(() =>
      expect(screen.queryByTestId("dropzone-error")).toBeNull(),
    );
    expect(onFile).toHaveBeenCalledTimes(1);
  });
});
