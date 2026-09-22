import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/app/notes/revision",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

import { ConceptsDrawer, readingBlocks, readingMinutes, readingPreview } from "@/components/concepts-reading";
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
  readingError: "",
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
      units: [{ unitNumber: "1", label: "Unit 1", title: "", topics: [topic] }],
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

describe("the sheet's worked examples", () => {
  const reading = [
    "### 1. Machine Performance Metrics",
    "Mechanical Advantage is the ratio of the Load (W) moved to the Effort (P) applied.",
    "**Worked:** A crane lifts 2000 lb with a 50 lb effort, so the mechanical advantage is 2000/50 = 40.",
    "**In the exam:** Given the load and effort, find the mechanical advantage.",
    "### 2. Velocity Ratio",
    "**Worked:** Yadi driver ma 10 teeth ra follower ma 50 teeth chha bhane velocity ratio 1/5 hunchha.",
  ];

  it("pulls each one out of the reading and numbers them in order", () => {
    const blocks = readingBlocks(reading);
    expect(blocks.map((block) => block.kind)).toEqual(["text", "text", "example", "text", "text", "example"]);
    expect(blocks[2]).toEqual({
      kind: "example",
      number: 1,
      text: "A crane lifts 2000 lb with a 50 lb effort, so the mechanical advantage is 2000/50 = 40.",
    });
    // The Roman Nepali translation keeps the label, so it gets its card too.
    expect(blocks[5]).toMatchObject({ kind: "example", number: 2 });
    // A bare label with nothing after it stays an ordinary paragraph.
    expect(readingBlocks(["**Worked:**"])).toEqual([{ kind: "text", text: "**Worked:**" }]);
  });

  it("writes each one onto the reading's ruled sheet, labelled", () => {
    const sheet = renderToStaticMarkup(
      createElement(ConceptsDrawer, {
        source: { id: topic.challengeId, title: topic.title, subjectName: topic.subjectName, reading },
        onClose: () => {},
      }),
    );
    expect(sheet).toContain(">Example 1</p>");
    expect(sheet).toContain(">Example 2</p>");
    // One sheet for the whole reading: an example is a labelled stretch of it,
    // not a card laid on top.
    expect(sheet.match(/class="answer-paper"/g)).toHaveLength(1);
    expect(sheet).toContain("answer-paper-body font-revision-answer");
    // The label is the card's now, not the text's.
    expect(sheet).not.toContain("Worked:");
    expect(sheet).toContain("the mechanical advantage is 2000/50 = 40.");
    // The face is the reader's, with the picker to change it.
    expect(sheet).toContain("--answer-font:");
    expect(sheet).toContain("Handwriting font");
  });

  it("writes a reading with no worked example on the sheet too, with the picker", () => {
    const sheet = renderToStaticMarkup(
      createElement(ConceptsDrawer, {
        source: { id: topic.challengeId, title: topic.title, subjectName: topic.subjectName, reading: READING },
        onClose: () => {},
      }),
    );
    // The whole reading is the note paper, every paragraph in the reader's hand.
    expect(sheet.match(/class="answer-paper"/g)).toHaveLength(1);
    expect(sheet.match(/answer-paper-body font-revision-answer/g)).toHaveLength(READING.length);
    expect(sheet).toContain("Handwriting font");
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
