import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConceptsCard } from "@/components/concepts-reading";

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
    const stepOne = challengeScreen.slice(challengeScreen.indexOf("{activeStep === 1 ? ("));
    expect(stepOne.indexOf("<ConceptsCard")).toBeGreaterThan(-1);
    expect(stepOne.indexOf("<ConceptsCard")).toBeLessThan(stepOne.indexOf("learnQuestions.map"));
    expect(stepOne).toContain("reading: content?.lesson?.content ?? []");
  });

  it("says the reading is on its way while the background pass is still writing it", () => {
    expect(challengeScreen).toContain('!content?.lesson?.content?.length && content?.contentStatus === "pending"');
  });

  it("is the same component Revision uses, not a second copy", () => {
    expect(revisionPage).toMatch(/import \{[^}]*\bConceptsCard\b[^}]*\} from "@\/components\/concepts-reading";/);
    expect(challengeScreen).toContain('import { ConceptsCard } from "@/components/concepts-reading";');
    expect(revisionPage).not.toContain("function ConceptsDrawer");
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
    expect(html).toContain("First paragraph of the reading.");
    expect(html).toContain('aria-haspopup="dialog"');
  });
});
