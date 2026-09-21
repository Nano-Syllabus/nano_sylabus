import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("app/globals.css", "utf8");
const dashboard = readFileSync("components/student-daily-dashboard.tsx", "utf8");
// The hub's static frame (heading, loop card, card styles) lives beside it so
// the route skeleton can draw the same thing; the screen is both files.
const challenges =
  readFileSync("components/challenges-dashboard-client.tsx", "utf8") +
  readFileSync("components/challenge-hub-frame.tsx", "utf8");
const library = readFileSync("components/library-nanoai-workspace.tsx", "utf8");
const revision = readFileSync("components/revision-docs-client.tsx", "utf8");
const billing = readFileSync("components/billing-page-client.tsx", "utf8");

describe("student app typography scale", () => {
  it("defines the creator workspace hierarchy once", () => {
    expect(styles).toContain("@utility type-student-page-title");
    expect(styles).toContain("font-size: 1.625rem");
    expect(styles).toContain("@utility type-student-section-title");
    expect(styles).toContain("font-size: 1.125rem");
    expect(styles).toContain("@utility type-student-card-title");
    expect(styles).toContain("font-size: 1rem");
    expect(styles).toContain("@utility type-student-body");
    expect(styles).toContain("@utility type-student-meta");
  });

  it("uses the shared hierarchy on the main student screens", () => {
    for (const source of [dashboard, challenges, library, revision, billing]) {
      expect(source).toContain("type-student-page-title");
      expect(source).toContain("type-student-section-title");
    }
  });

  it("uses the card-title scale for plan feature headings", () => {
    expect(billing).toContain('<h3 className="type-student-card-title mt-4 text-[#222a3a]">{includes}</h3>');
  });

  it("uses the shared body scale for pricing support copy", () => {
    expect(billing).toContain("type-student-body mt-1.5 font-medium text-[#697387]");
    expect(billing).toContain("type-student-body mt-1 min-h-4 font-medium text-[#697387]");
  });
});
