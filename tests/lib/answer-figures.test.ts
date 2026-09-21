import { describe, expect, it } from "vitest";
import { emptyFigureSection, figureBrief, withFigure } from "@/lib/answer-figures";

const QUESTION =
  "A digital system defines logic-1 as a nominal 3V signal and logic-0 as a nominal 0V signal. Sketch the voltage signal range diagram for this system.";

describe("worked solutions that promise a picture", () => {
  it("finds a Diagram heading with nothing under it — the stored shape production left", () => {
    const section = emptyFigureSection("### Diagram");
    expect(section).toEqual({ heading: "Diagram", insertAt: 11, prose: "" });
  });

  it("keeps what the section says about the picture, and stops at the next heading", () => {
    const solution = [
      "### Diagram",
      "",
      "The forbidden band sits between the two allowed ranges.",
      "",
      "### Forbidden Region",
      "",
      "Anything between 0.5 V and 2.5 V is undefined.",
    ].join("\n");
    const section = emptyFigureSection(solution)!;
    expect(section.heading).toBe("Diagram");
    expect(section.prose).toBe("The forbidden band sits between the two allowed ranges.");
  });

  it("leaves alone a section that already has its picture, or a fence the frontend draws", () => {
    expect(emptyFigureSection("### Diagram\n\n![Diagram](/api/figure/abc.png)")).toBeNull();
    expect(emptyFigureSection("### Diagram\n\n```animate\nconcept: capacitor\n```")).toBeNull();
  });

  it("does not take every heading with a picture word near it", () => {
    expect(emptyFigureSection("### Circuit Analysis\n\nApply KVL around the loop.")).toBeNull();
    expect(emptyFigureSection("**Given.** 3V logic.\n\n**Answer.** 1.")).toBeNull();
    // Long headings are sections ABOUT diagrams, not frames around one.
    expect(
      emptyFigureSection(`### ${"Why a timing diagram matters in synchronous design ".repeat(2)}`),
    ).toBeNull();
  });

  it("puts the picture directly under its heading and keeps every word of the answer", () => {
    const solution = "### Logic Diagram\n\nNOT then AND.\n\n### Truth Table\n\n| A | Y |";
    const section = emptyFigureSection(solution)!;
    const next = withFigure(solution, section, "/api/figure/45b6.png");
    expect(next).toBe(
      "### Logic Diagram\n\n![Logic Diagram](/api/figure/45b6.png)\n\nNOT then AND.\n\n### Truth Table\n\n| A | Y |",
    );
    expect(emptyFigureSection(next)).toBeNull();
  });

  it("briefs the renderer from the question, since the answer's own brief was thrown away", () => {
    const brief = figureBrief(QUESTION, { heading: "Diagram", insertAt: 11, prose: "" });
    expect(brief).toContain(`Question: ${QUESTION}`);
    expect(brief).toContain("fully labelled");
    expect(brief).not.toContain("Diagram:");
  });
});
