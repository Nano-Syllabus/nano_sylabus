import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/app/notes/revision",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

import { ConceptsDrawer, readingMinutes, readingPreview } from "@/components/concepts-reading";
import { RevisionDocsClient } from "@/components/revision-docs-client";
import type { RevisionDocTopic, StudentRevisionDocs } from "@/lib/data/student-revision-docs";

/**
 * The concepts reading lives in a sheet, not in the page.
 *
 * Inline, it was the longest thing on a revision page by several screens, and it
 * pushed what the page is for — the past questions and the worked examples — out
 * of sight.
 */

const READING = [
  "> **The idea:** Every machine transforms energy by moving a load with an effort.",
  "Applied Mechanics provides the language and tools to quantify how machines perform when they move loads.",
  "### 1. Machine Performance Metrics",
  "Mechanical Advantage is the ratio of the Load (W) moved to the Effort (P) applied.",
  "### Where it goes wrong\n\n- Neglecting the $P_0$ term in the force equation.",
];

const topic: RevisionDocTopic = {
  challengeId: "dfa2dad9-d943-4cc7-9c76-cd123c3317d9",
  topicKey: "definitions-and-scope",
  title: "Definitions and scope of Applied Mechanics",
  subjectName: "Applied Mechanics",
  completedAt: "2026-09-18T10:00:00Z",
  inProgress: false,
  scorePercent: 70,
  attempts: 1,
  readingPending: false,
  bigIdea: "Every machine transforms energy by moving a load with an effort.",
  reading: READING,
  focus: "Calculating the mechanical efficiency of a machine.",
  connections: ["Built on the fundamental principles of work and energy."],
  pastQuestions: [],
  solvedExamples: [],
};

const docs: StudentRevisionDocs = {
  topicCount: 1,
  unavailable: false,
  semesters: [{
    id: "y1s1", label: "Year 1 · Semester 1", yearNumber: 1, semesterNumber: 1, position: 1, topicCount: 1,
    subjects: [{
      courseId: "course-1", subjectSlug: "applied-mechanics", name: "Applied Mechanics", topicCount: 1,
      units: [{ unitNumber: "1", label: "Unit 1", topics: [topic] }],
    }],
  }],
};

describe("revision docs: the concepts reading", () => {
  const page = renderToStaticMarkup(createElement(RevisionDocsClient, { docs }));

  it("is not laid out inline on the page any more", () => {
    // The body of the reading only appears once the sheet is opened.
    expect(page).not.toContain("Mechanical Advantage is the ratio");
    expect(page).not.toContain("Machine Performance Metrics");
  });

  it("is offered as a teaser with a button that opens a dialog", () => {
    expect(page).toContain(">Concepts</h2>");
    expect(page).toContain("Read concepts");
    expect(page).toContain('aria-haspopup="dialog"');
    // The first plain paragraph as a preview — not the one-line idea quote the
    // reading opens with.
    expect(page).toContain("Applied Mechanics provides the language and tools");
  });

  it("carries no idea, what-it-tested or how-this-connects cards", () => {
    // The reading opens with its idea and ends with its connections; the cards
    // only repeated it, so the page leads straight into the questions.
    expect(page).not.toContain("The idea");
    expect(page).not.toContain("What it tested");
    expect(page).not.toContain("How this connects");
    expect(page).not.toContain("Calculating the mechanical efficiency");
  });

  it("opens as a labelled modal dialog holding the same reading", () => {
    const sheet = renderToStaticMarkup(
      createElement(ConceptsDrawer, {
        source: { id: topic.challengeId, title: topic.title, subjectName: topic.subjectName, reading: topic.reading },
        onClose: () => {},
      }),
    );
    expect(sheet).toContain('role="dialog"');
    expect(sheet).toContain('aria-modal="true"');
    const labelledBy = sheet.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(sheet).toContain(`id="${labelledBy}"`);
    // Every paragraph of the reading, in order — the same content, moved.
    expect(sheet).toContain("Mechanical Advantage is the ratio");
    expect(sheet).toContain("Machine Performance Metrics");
    expect(sheet.indexOf("Applied Mechanics provides")).toBeLessThan(sheet.indexOf("Machine Performance Metrics"));
    expect(sheet).toContain("Close concepts");
  });
});

describe("the teaser's preview and length", () => {
  it("skips the idea line and headings, and drops markup", () => {
    expect(readingPreview(["> **The idea:** x", "## Heading", "Uses **bold** and $P_0$ and [a link](https://x)."]))
      .toBe("Uses bold and P0 and a link.");
  });

  it("estimates reading time at a normal reading pace, never zero", () => {
    expect(readingMinutes(["word ".repeat(1000)])).toBe(5);
    expect(readingMinutes(["short"])).toBe(1);
  });
});
