import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const loadingSource = readFileSync("app/communities/loading.tsx", "utf8");

describe("public community catalog loading state", () => {
  it("shows only the catalog skeleton without flashing the legacy navbar", () => {
    expect(loadingSource).toContain('aria-label="Loading communities"');
    expect(loadingSource).not.toContain("LandingHeader");
  });
});
