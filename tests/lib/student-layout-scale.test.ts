import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("app/globals.css", "utf8");
const dashboard = readFileSync("components/student-daily-dashboard.tsx", "utf8");
// The hub's static frame lives beside it so the route skeleton can draw the same
// thing; the challenges screen is both files.
const challenges =
  readFileSync("components/challenges-dashboard-client.tsx", "utf8") +
  readFileSync("components/challenge-hub-frame.tsx", "utf8");
const community = readFileSync("components/community-hub-client.tsx", "utf8");
const courses = readFileSync("components/student-courses-client.tsx", "utf8");
const subjects = readFileSync("components/subject-explorer-client.tsx", "utf8");
const exams = readFileSync("components/student-exams-client.tsx", "utf8");
const library = readFileSync("components/library-nanoai-workspace.tsx", "utf8");
const billing = readFileSync("components/billing-page-client.tsx", "utf8");

describe("student app layout scale", () => {
  it("defines one creator-aligned page frame and compact surface", () => {
    expect(styles).toContain("@utility student-page-frame");
    expect(styles).toContain("max-width: 77.5rem");
    expect(styles).toContain("padding: 1.25rem 1rem 4.5rem");
    expect(styles).toContain("padding: 1.5rem 1.5rem 4.5rem");
    expect(styles).toContain("@utility student-surface");
  });

  it("uses the shared frame on the main browse, learn, and practice surfaces", () => {
    for (const source of [dashboard, community, courses, subjects, exams, library]) {
      expect(source).toContain("student-page-frame");
    }
  });

  it("keeps pricing on the same content width as the student portal", () => {
    expect(billing).toContain("student-page-width");
    expect(billing).toContain("grid-cols-1 items-stretch gap-4 lg:grid-cols-3");
    expect(billing).toContain("relative flex min-h-[400px] w-full flex-col");
    expect(billing).not.toContain("max-w-[1000px]");
    expect(billing).not.toContain("max-w-[320px]");
  });

  it("keeps the specialised challenge workspace separate from generic page framing", () => {
    expect(challenges).toContain("focusMode");
    expect(challenges).toContain("type-student-page-title");
  });
});
