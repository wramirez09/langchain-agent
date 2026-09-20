const infoMock = jest.fn();
jest.mock("sonner", () => ({
  toast: { info: (...a: unknown[]) => infoMock(...a) },
}));

import { render } from "@testing-library/react";
import {
  HipaaCheckToast,
  __resetHipaaCheckToasts,
} from "../artifact/HipaaCheckToast";

beforeEach(() => {
  infoMock.mockReset();
  __resetHipaaCheckToasts();
});

describe("HipaaCheckToast", () => {
  it("renders nothing", () => {
    const { container } = render(<HipaaCheckToast active runKey="m1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says we are checking for HIPAA compliance", () => {
    render(<HipaaCheckToast active runKey="m1" />);
    expect(infoMock).toHaveBeenCalledTimes(1);
    expect(infoMock.mock.calls[0][0]).toBe("Checking for HIPAA compliance");
    expect(infoMock.mock.calls[0][1].description).toMatch(/identifiers/i);
  });

  it("stays silent when no run is in flight", () => {
    render(<HipaaCheckToast active={false} runKey="m1" />);
    expect(infoMock).not.toHaveBeenCalled();
  });

  it("announces once per run, not once per render", () => {
    const { rerender } = render(<HipaaCheckToast active runKey="m1" />);
    rerender(<HipaaCheckToast active runKey="m1" />);
    rerender(<HipaaCheckToast active runKey="m1" />);
    expect(infoMock).toHaveBeenCalledTimes(1);
  });

  /** Chat transcript and Output tab can both be mounted. */
  it("announces once even when mounted twice", () => {
    render(
      <>
        <HipaaCheckToast active runKey="m1" />
        <HipaaCheckToast active runKey="m1" />
      </>,
    );
    expect(infoMock).toHaveBeenCalledTimes(1);
  });

  it("announces again for the next request", () => {
    render(<HipaaCheckToast active runKey="m1" />);
    render(<HipaaCheckToast active runKey="m2" />);
    expect(infoMock).toHaveBeenCalledTimes(2);
  });
});
