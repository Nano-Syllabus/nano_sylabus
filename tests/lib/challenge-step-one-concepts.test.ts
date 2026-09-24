import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AwaitedConceptsCard, ConceptsCard } from "@/components/concepts-reading";

/**
 * Step 1 of a challenge leads with the concepts card — the same card, and the
 * same sheet, as the challenge's page in Revision.
 *
 * (Superseding 2026-09-17, when step 1 was cut to the past questions alone: the
 * reading comes back as a card, not as a section on the screen.)
 */
const challengeScreen = readFileSync("components/challenges-dashboard-client.tsx", "utf8");
const revisionPage = readFileSync("components/revision-docs-client.tsx", "utf8");

describe("step 1 of a challenge", () => {
  it("shows the shared concepts card, above the past questions", () => {
    const stepOne = challengeScreen.slice(challengeScreen.indexOf(": activeStep === 1 ? ("));
    expect(stepOne.indexOf("<ConceptsCard")).toBeGreaterThan(-1);
    expect(stepOne.indexOf("<ConceptsCard")).toBeLessThan(stepOne.indexOf("learnQuestions.map"));
    // In the reader's language — see `components/study-language.tsx`.
    expect(stepOne).toMatch(/reading: inStudyLanguage\([\s\S]*?content\.lesson\.content,\s*\)/);
  });

  it("gives every opened challenge its concepts card: the reading, or the card that waits for it", () => {
    const stepOne = challengeScreen.slice(challengeScreen.indexOf(": activeStep === 1 ? ("));
    // No branch where an opened challenge shows neither — that was a challenge
    // marked ready before its reading landed, and the poll had already stopped.
    expect(stepOne).toMatch(/\{content\?\.lesson\?\.content\?\.length \? \(\s*<ConceptsCard/);
    expect(stepOne).toMatch(/\) : content \? \(\s*(\/\*[\s\S]*?\*\/\s*)?<AwaitedConceptsCard/);
    // While the build runs, the screen's own poll brings the reading in.
    expect(stepOne).toContain('waiting={content.contentStatus === "pending" && !content.contentError}');
    expect(stepOne).toContain("readingError={content.readingError}");
    // Kept on the challenge when it lands, so leaving step 1 does not lose it.
    expect(stepOne).toContain("content: { ...content, lesson: { ...content.lesson, content: reading } },");
  });

  it("is the same component Revision uses, not a second copy", () => {
    expect(revisionPage).toMatch(/import \{[^}]*\bConceptsCard\b[^}]*\} from "@\/components\/concepts-reading";/);
    expect(revisionPage).toMatch(/import \{[^}]*\bAwaitedConceptsCard\b[^}]*\} from "@\/components\/concepts-reading";/);
    expect(challengeScreen).toContain('import { AwaitedConceptsCard, ConceptsCard } from "@/components/concepts-reading";');
    expect(revisionPage).not.toContain("function ConceptsDrawer");
    // Revision no longer tells a student to restart a challenge to get its reading.
    expect(revisionPage).not.toContain("Restart it from the Challenge Hub to file a");
  });
});

describe("the card that waits for a reading", () => {
  const source = { id: "c", title: "t", subjectName: "s", reading: [] as string[] };

  it("says the reading is on its way", () => {
    const html = renderToStaticMarkup(createElement(AwaitedConceptsCard, { source }));
    expect(html).toContain('role="status"');
    expect(html).toContain("being written from your course material");
  });

  it("says so, and stops waiting, when the material could not produce one", () => {
    const html = renderToStaticMarkup(
      createElement(AwaitedConceptsCard, { source, readingError: "no indexed teaching material" }),
    );
    expect(html).toContain("couldn&#x27;t be written from your course material yet");
    expect(html).not.toContain("being written");
  });

  it("is the Concepts card itself once there is a reading", () => {
    const html = renderToStaticMarkup(
      createElement(AwaitedConceptsCard, { source: { ...source, reading: ["A paragraph."] } }),
    );
    expect(html).toContain(">Concepts</h2>");
    expect(html).toContain("Read concepts");
  });

  it("asks the challenge's row, which is what has the server write it", () => {
    const sheet = readFileSync("components/concepts-reading.tsx", "utf8");
    expect(sheet).toContain("fetch(`/api/student/challenges/${encodeURIComponent(source.id)}/content`)");
    expect(sheet).toContain("if (waiting || reading.length || error) return;");
  });
});

describe("Escape with the concepts sheet open", () => {
  it("closes the sheet without also leaving the challenge", () => {
    const sheet = readFileSync("components/concepts-reading.tsx", "utf8");
    // The sheet takes the key in the capture phase and stops it there...
    expect(sheet).toContain('window.addEventListener("keydown", onKeyDown, true);');
    expect(sheet).toContain("event.stopPropagation();");
    // ...and focus mode ignores an Escape something on top already used.
    expect(challengeScreen).toContain('if (event.key === "Escape" && !event.defaultPrevented) onBack();');
  });
});

describe("the card", () => {
  it("renders nothing when there is no reading to open", () => {
    const html = renderToStaticMarkup(
      createElement(ConceptsCard, { source: { id: "c", title: "t", subjectName: "s", reading: [] } }),
    );
    expect(html).toBe("");
  });

  it("offers the reading behind a button that opens a dialog", () => {
    const html = renderToStaticMarkup(
      createElement(ConceptsCard, {
        source: { id: "c", title: "t", subjectName: "s", reading: ["First paragraph of the reading."] },
      }),
    );
    expect(html).toContain(">Concepts</h2>");
    expect(html).toContain("1 min read");
    // Only the heading and the button: no clipped preview of the reading
    // (user, 2026-09-24) — the sheet behind the button holds all of it.
    expect(html).not.toContain("First paragraph of the reading.");
    expect(html).toContain('aria-haspopup="dialog"');
  });
});
