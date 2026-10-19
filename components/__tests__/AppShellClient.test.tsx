jest.mock("../AppSidebar", () => ({
  AppSidebar: ({ activeView, onViewChange }: any) => (
    <div data-testid="sidebar" data-view={activeView}>
      <button onClick={() => onViewChange("export")}>go-export</button>
    </div>
  ),
}));
jest.mock("../PriorAuthView", () => ({
  PriorAuthView: () => <div data-testid="auth-view">auth view</div>,
}));
jest.mock("../FileExportView", () => ({
  FileExportView: () => <div data-testid="export-view">export view</div>,
}));

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShellClient } from "../AppShellClient";

describe("AppShellClient", () => {
  it("renders both views (toggled via CSS) with auth as default", () => {
    render(<AppShellClient />);
    expect(screen.getByTestId("auth-view")).toBeInTheDocument();
    expect(screen.getByTestId("export-view")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar").dataset.view).toBe("auth");
  });

  it("passes view selection through to sidebar state", async () => {
    const user = userEvent.setup();
    render(<AppShellClient />);
    await user.click(screen.getByText("go-export"));
    expect(screen.getByTestId("sidebar").dataset.view).toBe("export");
  });

  /**
   * The upload view is gone: attaching a note is now a paperclip inside the
   * chat input, which de-identifies in the browser before anything is sent.
   * The old view posted the raw PDF to /api/retrieval/ingest.
   */
  it("no longer mounts a separate upload view", () => {
    render(<AppShellClient />);
    expect(screen.queryByTestId("upload-view")).toBeNull();
  });
});
