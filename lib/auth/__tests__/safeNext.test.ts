import { safeNext } from "../safeNext";

describe("safeNext", () => {
  it("keeps a same-origin path, query included", () => {
    expect(safeNext("/oauth/consent?authorization_id=abc", "/x")).toBe(
      "/oauth/consent?authorization_id=abc",
    );
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["https://evil.com"],
    ["evil.com"],
    ["//evil.com"],
    ["/\\evil.com"],
    ["/\t/evil.com"],
    ["/\n/evil.com"],
  ])("falls back for %p", (next) => {
    expect(safeNext(next, "/protected/preAuth")).toBe("/protected/preAuth");
  });
});
