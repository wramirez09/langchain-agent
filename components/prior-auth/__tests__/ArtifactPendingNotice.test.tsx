import { render, screen } from "@testing-library/react";
import { ArtifactPendingNotice } from "../artifact/ArtifactPendingNotice";

describe("ArtifactPendingNotice", () => {
  it("tells the user their text is being checked for PHI", () => {
    render(<ArtifactPendingNotice />);
    expect(screen.getByText(/Checking for any PHI/)).toBeInTheDocument();
  });

  it("lists the pipeline in the order the agent actually runs it", () => {
    render(<ArtifactPendingNotice />);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toMatch(/Checking for any PHI/);
    expect(items).toHaveLength(4);
    expect(items[items.length - 1]).toMatch(/Reviewing against payer criteria/);
  });

  /**
   * Only the first step is marked active. The chat panel has no stage data
   * here, so animating the rest would be a fake progress bar.
   */
  it("marks only the first step as active", () => {
    const { container } = render(<ArtifactPendingNotice />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(1);
  });
});
