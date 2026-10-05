import { describe, expect, it } from "vitest";
import { config } from "@/middleware";

// Next copies the body of anything that passes through middleware and stops at 10 MB.
describe("middleware and large uploads", () => {
  const matches = (path: string) =>
    config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(path));

  it("leaves the signed storage upload proxy alone, so big PDFs stream through", () => {
    expect(matches("/vps-storage/signed-upload/abc?expires=1&signature=2")).toBe(false);
    expect(matches("/vps-storage/signed-upload/abc")).toBe(false);
  });

  it("still covers pages that need their session refreshed", () => {
    expect(matches("/app/today")).toBe(true);
    expect(matches("/login")).toBe(true);
    expect(matches("/prepare/license")).toBe(true);
  });
});
