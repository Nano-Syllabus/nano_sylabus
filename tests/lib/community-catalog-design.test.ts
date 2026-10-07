import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const catalog = readFileSync("components/community-catalog-client.tsx", "utf8");

describe("public community catalog design system", () => {
  it("uses the portal's display/body hierarchy instead of oversized headings", () => {
    expect(catalog).toContain(".ns-hero h1");
    expect(catalog).toContain("font-family: var(--font-display);");
    expect(catalog).toContain("font-size: clamp(2.5rem, 3.2vw, 3.25rem);");
    expect(catalog).toContain(".ns-browse-intro h2");
    expect(catalog).toContain(".ns-fc-title");
  });

  it("has no faculty filters and respects reduced motion", () => {
    expect(catalog).not.toContain("ns-filter");
    expect(catalog).toContain("prefers-reduced-motion: reduce");
  });

  it("carries the landing page's lime and blue palette into community discovery", () => {
    expect(catalog).toContain("background: #dcfa72;");
    expect(catalog).toContain("background: #ebf1ff;");
    expect(catalog).toContain("background: #3049ed;");
    expect(catalog).toContain("background: #f5f7f1;");
  });

  it("uses faculty language in the discovery actions", () => {
    expect(catalog).toContain("Add New Faculty");
    expect(catalog).toContain("Exam sites");
    expect(catalog).not.toContain("Browse faculties");
  });
});
