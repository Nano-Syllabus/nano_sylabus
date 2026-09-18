import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/app/challenges",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

import { SubjectCoverage } from "@/components/challenges-dashboard-client";

/**
 * The Challenge Hub owns the running semester now, and says how far through each
 * subject a student is.
 *
 * The running semester is the thing that decides which subjects the queue draws
 * from, so it moved out of the Library to sit beside the queue it changes,
 * replacing the per-subject filter. Each row trades the ids it used to print
 * for the subtopic, and the column the subtopic vacated shows coverage.
 */

describe("the running semester lives on the Challenge Hub", () => {
  const hub = readFileSync("components/challenges-dashboard-client.tsx", "utf8");

  it("offers the semester picker where the subject filter used to be", () => {
    expect(hub).toContain("RUNNING SEMESTER");
    expect(hub).toContain('id="running-semester"');
    expect(hub).not.toContain("PRIORITY SUBJECT");
    expect(hub).not.toContain('id="priority-subject"');
  });

  it("saves through the same membership write the Library used to make", () => {
    expect(hub).toContain("/membership`");
    expect(hub).toContain('method: "PATCH"');
    expect(hub).toContain("JSON.stringify({ termId })");
  });

  it("no longer prints the challenge and subject ids under each row", () => {
    expect(hub).not.toContain("Challenge id ");
    expect(hub).not.toContain("Subject id ");
  });
});

describe("a subject's coverage bar", () => {
  const render = (progress?: { covered: number; total: number }) =>
    renderToStaticMarkup(createElement(SubjectCoverage, { progress }));

  it("fills to the share of subtopics with a completed challenge", () => {
    const html = render({ covered: 12, total: 38 });

    expect(html).toContain("12 of 38 subtopics completed");
    expect(html).toContain("32%");
    expect(html).toContain('aria-valuenow="32"');
    expect(html).toContain("width:32%");
  });

  it("is an outlined track with a nub at the start before anything is completed", () => {
    const html = render({ covered: 0, total: 38 });

    expect(html).toContain("0 of 38 subtopics completed");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("border-[#2563eb]/40");
    // Honest at 0%, and still visibly a bar that has begun.
    expect(html).toContain("0%");
    expect(html).toContain("width:0%;min-width:6px");
  });

  it("never prints NaN for a row whose count is missing", () => {
    // Seen as "NaN of 44 subtopics completed · NaN%": a row from a payload that
    // predates `completedTopics` arrives with it undefined.
    const html = render({ covered: undefined as unknown as number, total: 44 });

    expect(html).not.toContain("NaN");
    expect(html).toContain("0 of 44 subtopics completed");
    expect(html).toContain('aria-valuenow="0"');
  });

  it("never overflows when attempts outrun a re-extracted catalogue", () => {
    // A catalogue re-extracted into fewer subtopics can leave more attempted
    // topics than the subject now lists.
    expect(render({ covered: 45, total: 38 })).toContain("100%");
  });

  it("says a subject has no map rather than drawing a bar that reads as nothing done", () => {
    expect(render({ covered: 0, total: 0 })).toContain("Topics not mapped yet");
    expect(render(undefined)).toContain("Topics not mapped yet");
  });
});
