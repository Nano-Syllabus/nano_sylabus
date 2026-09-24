import { describe, expect, it } from "vitest";
import {
  drawnFigureDigest,
  emptyFigureSection,
  figureBrief,
  withFigure,
  withoutFigure,
} from "@/lib/answer-figures";

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

describe("worked solutions that describe a picture without a heading", () => {
  // The real stored example (screenshot, 2026-09-24): no "### Diagram", just prose.
  const STORED =
    "(a) The diagram shows: Logic-1 range is 3.0V to 4.0V (nominal 3.5V); Logic-0 range is 0V to 1.0V (nominal 0.5V). The forbidden region is the range between 1.0V and 3.0V.\n\n(b) A signal of 1.2V falls within the forbidden region.";
  const ASKED =
    "A digital system defines logic-1 as 3.5V ± 0.5V and logic-0 as 0.5V ± 0.5V. (a) Sketch the voltage range diagram for this system. (b) If an input signal of 1.2V is received, explain how the system interprets it.";

  it("finds 'The diagram shows' with no image, and puts the picture above that paragraph", () => {
    const section = emptyFigureSection(STORED)!;
    expect(section).toMatchObject({ heading: "Diagram", insertAt: 0, placement: "before" });
    expect(section.prose).toContain("Logic-1 range is 3.0V to 4.0V");
    const drawn = withFigure(STORED, section, "/api/figure/abc.png");
    expect(drawn.startsWith("![Diagram](/api/figure/abc.png)\n\n(a) The diagram shows")).toBe(true);
    expect(emptyFigureSection(drawn, ASKED)).toBeNull();
  });

  it("finds the paragraph that mentions it, not the first one", () => {
    const solution = "Given: 3V logic.\n\nAs the sketch below shows, the bands do not overlap.";
    const section = emptyFigureSection(solution)!;
    expect(section.insertAt).toBe(solution.indexOf("As the sketch"));
    expect(withFigure(solution, section, "/x.png")).toBe(
      "Given: 3V logic.\n\n![Diagram](/x.png)\n\nAs the sketch below shows, the bands do not overlap.",
    );
  });

  it("draws for a question that asked for a diagram even when the answer never says so", () => {
    expect(emptyFigureSection("Logic-1 is 3–4V; logic-0 is 0–1V.", ASKED)).toMatchObject({
      insertAt: 0,
      placement: "before",
    });
  });

  it("leaves alone answers that have their picture, or never needed one", () => {
    expect(emptyFigureSection(`![Diagram](/api/figure/a.png)\n\n${STORED}`, ASKED)).toBeNull();
    expect(emptyFigureSection("Apply KVL around the loop.", "Find the current in the circuit.")).toBeNull();
    expect(emptyFigureSection("| A | Y |\n|---|---|", "Draw the truth table of an XOR gate.")).toBeNull();
  });
});

describe("redrawing a dead figure", () => {
  const dead = "/api/figure/c65ef4e698d41b0ee0b336daf4be5976.png";

  it("names only server-drawn figure URLs", () => {
    expect(drawnFigureDigest(dead)).toBe("c65ef4e698d41b0ee0b336daf4be5976");
    expect(drawnFigureDigest("/api/media/abc/poster.png")).toBeNull();
    expect(drawnFigureDigest("https://evil.example/api/figure/abc.png")).toBeNull();
  });

  it("removes the dead image so the section reads as missing again", () => {
    const question = "Draw the circuit diagrams for both configurations.";
    const solution = `![Diagram](${dead})\n\n## Source Conversion\nA practical current source…`;
    const stripped = withoutFigure(solution, dead);
    expect(stripped).toBe("## Source Conversion\nA practical current source…");
    expect(emptyFigureSection(stripped, question)).toMatchObject({ insertAt: 0, placement: "before" });

    const headed = `### Diagram\n\n![Diagram](${dead})\n\n### Steps\nOne.`;
    const section = emptyFigureSection(withoutFigure(headed, dead), question);
    expect(section?.heading).toBe("Diagram");
  });

  it("gives a redraw a different brief from the one that failed", () => {
    const section = { heading: "Diagram", insertAt: 0, prose: "", placement: "before" as const };
    const first = figureBrief("Draw it.", section);
    const again = figureBrief("Draw it.", section, "c65ef4e698d41b0ee0b336daf4be5976");
    expect(again).not.toBe(first);
    expect(again).toContain("Keep the scene simple");
  });
});
