const warnMock = jest.fn();
jest.mock("sonner", () => ({
  toast: { warning: (...a: unknown[]) => warnMock(...a) },
}));

import { render } from "@testing-library/react";
import {
  PhiNoticeToast,
  __resetPhiNoticeToasts,
} from "../artifact/PhiNoticeToast";

beforeEach(() => {
  warnMock.mockReset();
  __resetPhiNoticeToasts();
});

describe("PhiNoticeToast", () => {
  it("renders nothing", () => {
    const { container } = render(
      <PhiNoticeToast notice="PHI removed." messageId="m1" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("announces that the agents found and removed PHI", () => {
    render(<PhiNoticeToast notice="PHI removed." messageId="m1" />);
    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(warnMock.mock.calls[0][0]).toBe("Our agents found and removed PHI");
    expect(warnMock.mock.calls[0][1].description).toMatch(/de-identified/i);
  });

  it.each([undefined, "", "   "])(
    "stays silent when phiNotice is %p",
    (notice) => {
      render(<PhiNoticeToast notice={notice} messageId="m1" />);
      expect(warnMock).not.toHaveBeenCalled();
    },
  );

  /**
   * The same artifact renders concurrently in the chat transcript and the
   * Output tab. A per-component ref would fire two identical toasts for one
   * screening run, which is why dedupe is module-level.
   */
  it("fires once even when the artifact is mounted twice", () => {
    render(
      <>
        <PhiNoticeToast notice="PHI removed." messageId="m1" />
        <PhiNoticeToast notice="PHI removed." messageId="m1" />
      </>,
    );
    expect(warnMock).toHaveBeenCalledTimes(1);
  });

  it("does not re-fire when a streaming artifact re-renders", () => {
    const { rerender } = render(
      <PhiNoticeToast notice="PHI rem" messageId="m1" />,
    );
    rerender(<PhiNoticeToast notice="PHI removed." messageId="m1" />);
    rerender(<PhiNoticeToast notice="PHI removed fully." messageId="m1" />);
    expect(warnMock).toHaveBeenCalledTimes(1);
  });

  it("announces a genuinely different run", () => {
    render(<PhiNoticeToast notice="PHI removed." messageId="m1" />);
    render(<PhiNoticeToast notice="PHI removed." messageId="m2" />);
    expect(warnMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to the notice text when there is no message id", () => {
    render(<PhiNoticeToast notice="PHI removed." />);
    render(<PhiNoticeToast notice="PHI removed." />);
    expect(warnMock).toHaveBeenCalledTimes(1);
  });
});
