import { render, screen } from "@testing-library/react";
import { UserRequestFields } from "../UserRequestFields";
import { serializeQuery } from "@/lib/priorAuth/serializeQuery";

const FIELDS = {
  guidelines: "Commercial",
  state: "Texas",
  treatment: "lumbar fusion L4-L5",
  cptCodes: "22633",
  diagnosis: "lumbar spinal stenosis (M48.06)",
  patientHistory: "failed PT x8 weeks",
  relevantHistory: "no prior lumbar surgery",
};

describe("UserRequestFields", () => {
  it("renders each labeled field from a form-built query", () => {
    render(<UserRequestFields content={serializeQuery(FIELDS)} />);
    expect(screen.getByText("Guidelines")).toBeInTheDocument();
    expect(screen.getByText("Commercial")).toBeInTheDocument();
    expect(screen.getByText("CPT / HCPCS")).toBeInTheDocument();
    expect(screen.getByText("22633")).toBeInTheDocument();
  });

  it("keeps History and Relevant Medical History apart", () => {
    render(<UserRequestFields content={serializeQuery(FIELDS)} />);
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("Relevant Medical History")).toBeInTheDocument();
    expect(screen.getByText("failed PT x8 weeks")).toBeInTheDocument();
    expect(screen.getByText("no prior lumbar surgery")).toBeInTheDocument();
  });

  /**
   * The attestation has to survive out of the upload screen and into the
   * transcript, the saved query and the PDF export -- which it only does if
   * this parser knows the label.
   */
  it("renders the de-identification receipt from a note-built query", () => {
    render(
      <UserRequestFields
        content={serializeQuery(FIELDS, {
          deidentification: "14 identifiers removed from an uploaded note",
        })}
      />,
    );
    expect(screen.getByText("De-identification")).toBeInTheDocument();
    expect(
      screen.getByText("14 identifiers removed from an uploaded note"),
    ).toBeInTheDocument();
  });

  it("does not show the receipt for a form-built query", () => {
    render(<UserRequestFields content={serializeQuery(FIELDS)} />);
    expect(screen.queryByText("De-identification")).not.toBeInTheDocument();
  });

  it("renders a trailing free-text note as Additional Notes", () => {
    render(
      <UserRequestFields
        content={serializeQuery(FIELDS, { note: "is this covered?" })}
      />,
    );
    expect(screen.getByText("Additional Notes")).toBeInTheDocument();
    expect(screen.getByText("is this covered?")).toBeInTheDocument();
  });

  it("falls back to plain text when there are no labels", () => {
    render(<UserRequestFields content="just a typed follow-up question" />);
    expect(
      screen.getByText("just a typed follow-up question"),
    ).toBeInTheDocument();
  });

  it("renders nothing for empty content", () => {
    const { container } = render(<UserRequestFields content="" />);
    expect(container.textContent).toBe("");
  });
});

describe("UserRequestFields — while the request is being checked", () => {
  /**
   * This card echoes back exactly what the user typed, and Diagnosis/History
   * are free-text fields people put patient names in. Holding the values back
   * until the check has run means the one surface that reliably displays PHI
   * is not displaying it while we are still deciding whether it is PHI.
   */
  it("hides the typed values behind a shimmer", () => {
    render(
      <UserRequestFields
        pending
        content={serializeQuery({ ...FIELDS, diagnosis: "john smith" })}
      />,
    );
    expect(screen.queryByText("john smith")).toBeNull();
    expect(screen.queryByText("lumbar fusion L4-L5")).toBeNull();
    expect(screen.getByTestId("request-phi-check")).toBeInTheDocument();
  });

  it("keeps the labels so the card holds its shape", () => {
    render(<UserRequestFields pending content={serializeQuery(FIELDS)} />);
    expect(screen.getByText("Diagnosis")).toBeInTheDocument();
    expect(screen.getByText("Treatment")).toBeInTheDocument();
    expect(screen.getByText("CPT / HCPCS")).toBeInTheDocument();
  });

  it("reveals the values once the check is done", () => {
    const { rerender } = render(
      <UserRequestFields
        pending
        content={serializeQuery({ ...FIELDS, diagnosis: "john smith" })}
      />,
    );
    expect(screen.queryByText("john smith")).toBeNull();

    rerender(
      <UserRequestFields
        content={serializeQuery({ ...FIELDS, diagnosis: "john smith" })}
      />,
    );
    expect(screen.getByText("john smith")).toBeInTheDocument();
    expect(screen.queryByTestId("request-phi-check")).toBeNull();
  });

  it("falls through to plain text when there are no labeled fields", () => {
    render(<UserRequestFields pending content="just a follow-up question" />);
    expect(screen.queryByTestId("request-phi-check")).toBeNull();
    expect(screen.getByText("just a follow-up question")).toBeInTheDocument();
  });
});
