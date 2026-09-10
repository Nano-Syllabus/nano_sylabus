import { afterEach, describe, expect, it, vi } from "vitest";

import { getGoogleAuthRedirectUrl } from "@/lib/auth-redirect";

describe("Google OAuth redirect", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns undefined during server rendering", () => {
    expect(getGoogleAuthRedirectUrl()).toBeUndefined();
  });

  it("keeps the callback on the custom domain where sign-in started", () => {
    vi.stubGlobal("window", {
      location: { origin: "https://www.nanosyllabus.com" },
    });

    expect(getGoogleAuthRedirectUrl()).toBe(
      "https://www.nanosyllabus.com/auth/callback",
    );
  });

  it("keeps local development on localhost", () => {
    vi.stubGlobal("window", {
      location: { origin: "http://localhost:3000" },
    });

    expect(getGoogleAuthRedirectUrl()).toBe(
      "http://localhost:3000/auth/callback",
    );
  });
});
