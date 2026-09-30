import { describe, expect, it } from "vitest";
import { usageCommunityHeader, usageCommunityStorage } from "@/lib/usage-community-context";

describe("usage community header", () => {
  it("is empty outside a tagged request", () => {
    expect(usageCommunityHeader()).toEqual({});
  });

  it("names the faculty for every backend call made inside one, however deep", async () => {
    const seen = await usageCommunityStorage.run("bei-2", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      // A stream's work is started from inside the request and finishes later.
      return new Promise<Record<string, string>>((resolve) =>
        setTimeout(() => resolve(usageCommunityHeader()), 1),
      );
    });
    expect(seen).toEqual({ "X-NSDI-Community": "bei-2" });
    expect(usageCommunityHeader()).toEqual({});
  });
});
