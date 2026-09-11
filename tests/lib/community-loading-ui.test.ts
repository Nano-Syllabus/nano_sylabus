import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("community loading layout", () => {
  it("matches the current community surface", () => {
    const loading = readFileSync("app/app/community/loading.tsx", "utf8");

    expect(loading).toContain('["overview", "members"]');
    expect(loading).not.toContain('["overview", "subjects", "forum", "members"]');
    expect(loading).toContain("Array.from({ length: 4 })");
    expect(loading).toContain("Array.from({ length: 2 })");
  });
});
