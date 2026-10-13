import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import fixture from "@/tests/fixtures/concept-microbook.json";
import { ConceptsDrawer, readingBlocks } from "@/components/concepts-reading";
import {
  evaluateConceptExpression,
  parseConceptActivity,
  conceptProgressKey,
} from "@/lib/concept-activities";
import { lessonParagraphsForTest } from "@/lib/data/student-challenges";
import { readingSections, readStudyWork, observedTrend } from "@/lib/concept-study";

const reading = [
  fixture.introduction,
  ...fixture.sections.flatMap((section, index) => [
    `### ${index + 1}. ${section.heading}`,
    section.body,
    ...section.activities.map(
      (activity) => `\`\`\`concept-activity\n${JSON.stringify(activity)}\n\`\`\``,
    ),
  ]),
];

describe("interactive concepts: the stored reading contract", () => {
  it("carries all activity types intact through paragraph storage", () => {
    const filed = lessonParagraphsForTest(reading.join("\n\n"));
    const blocks = readingBlocks(filed);
    expect(blocks.filter((b) => b.kind === "activity").map((b) => b.activity.kind)).toEqual([
      "diagram",
      "derivation",
      "choice",
      "experiment",
      "numeric",
      "exam",
    ]);
    const derivation = blocks.find(
      (b) => b.kind === "activity" && b.activity.kind === "derivation",
    );
    expect(
      derivation?.kind === "activity" &&
        derivation.activity.kind === "derivation" &&
        derivation.activity.steps[0].formula,
    ).toContain("\\frac");
  });

  it("renders controls and navigation without exposing the payload as code", () => {
    const html = renderToStaticMarkup(
      createElement(ConceptsDrawer, { source: { ...fixture, reading }, onClose() {} }),
    );
    for (const kind of ["diagram", "derivation", "choice", "experiment", "numeric", "exam"])
      expect(html).toContain(`data-concept-activity="${kind}"`);
    expect(html).toContain('aria-label="Lesson sections"');
    expect(html).toContain("Show next step");
    expect(html).toContain("Check answer");
    expect(html).toContain("Show model answer");
    expect(html).toContain("0 / 6 activities completed");
    expect(html).not.toContain("concept-activity\n");
    expect(html).not.toContain("&quot;answer_index&quot;");
    expect(html).toContain('class="answer-paper"');
    expect(html).toContain("Handwriting font");
    expect(html).toContain("Recall from your notes");
    expect(html).toContain("Predict before experimenting");
    expect(html).toContain("Check my choice");
  });

  it("isolates malformed activities while keeping surrounding teaching", () => {
    expect(readingBlocks(["Before\n\n```concept-activity\n{bad}\n```\n\nAfter"])).toEqual([
      { kind: "text", text: "Before" },
      { kind: "text", text: "This activity is unavailable. Continue with the lesson notes." },
      { kind: "text", text: "After" },
    ]);
    expect(
      parseConceptActivity(
        JSON.stringify({
          kind: "choice",
          title: "Bad",
          options: ["A", "B"],
          answer_index: 8,
          explanation: "Why",
        }),
      ),
    ).toBeNull();
    const diagram = fixture.sections[0].activities[0];
    expect(
      parseConceptActivity(
        JSON.stringify({ ...diagram, links: [{ from_id: "unknown", to_id: "yoke" }] }),
      ),
    ).toBeNull();
  });

  it("keeps progress separate for different topics and lesson versions", () => {
    expect(conceptProgressKey("motor", reading)).toBe(conceptProgressKey("motor", [...reading]));
    expect(conceptProgressKey("motor", reading)).not.toBe(conceptProgressKey("rectifier", reading));
    expect(conceptProgressKey("motor", reading)).not.toBe(
      conceptProgressKey("motor", [...reading, "Changed"]),
    );
  });
});

describe("learning from the existing notes", () => {
  it("groups original content for recall without changing a block", () => {
    const original = [
      { kind: "text", text: "Original introduction." },
      { kind: "text", text: "### 1. Flux" },
      { kind: "text", text: "- Keep the exact note.\n- Keep $\\Phi$ and its unit." },
      { kind: "example", text: "Original worked example." },
      { kind: "text", text: "### 2. Torque" },
      { kind: "text", text: "$$T=k\\Phi I_a$$" },
    ];
    const snapshot = JSON.stringify(original);
    const sections = readingSections(original, "Motor");
    expect(sections.map((s) => [s.start, s.end, s.title])).toEqual([
      [0, 1, "Motor"],
      [1, 4, "1. Flux"],
      [4, 6, "2. Torque"],
    ]);
    expect(sections.flatMap((s) => original.slice(s.start, s.end))).toEqual(original);
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(sections.every((s) => s.hasNotes)).toBe(true);
  });

  it("adds recall to already-saved readings with no activity payload", () => {
    const html = renderToStaticMarkup(
      createElement(ConceptsDrawer, {
        source: {
          id: "existing",
          title: "Ohm's law",
          subjectName: "Circuits",
          reading: ["### Ohm's law", "- $V=IR$.\n- Resistance is measured in ohms."],
        },
        onClose() {},
      }),
    );
    expect(html).toContain("Cover notes and try");
    expect(html).toContain("Your explanation");
    expect(html).toContain("Resistance is measured in ohms.");
    expect(html).toContain('class="answer-paper"');
    expect(html).not.toContain("data-concept-activity=");
  });

  it("restores bounded drafts and rejects corrupt browser state", () => {
    const work = readStudyWork(
      JSON.stringify({
        answer: "My original reasoning",
        selected: 1,
        attempts: 2,
        confidence: "review",
        values: { Ia: 20 },
      }),
    );
    expect(work.answer).toBe("My original reasoning");
    expect(work.values).toEqual({ Ia: 20 });
    expect(work.confidence).toBe("review");
    expect(readStudyWork("{broken").answer).toBe("");
    expect(readStudyWork(JSON.stringify({ answer: "x".repeat(12001) })).answer).toBe("");
    expect(readStudyWork(JSON.stringify({ visible: -3 })).visible).toBe(1);
  });

  it("compares predictions against observed changes in either slider direction", () => {
    expect(observedTrend(215, 210, 10, 20)).toBe("decrease");
    expect(observedTrend(210, 215, 20, 10)).toBe("decrease");
    expect(observedTrend(50, 200, 10, 20)).toBe("increase");
    expect(observedTrend(5, 5, 10, 20)).toBe("same");
    expect(observedTrend(5, 5, 10, 10)).toBeNull();
    expect(observedTrend(5, Infinity, 10, 20)).toBeNull();
  });
});

describe("data-only experiment models", () => {
  it("accepts bit-building activities only within their representation range", () => {
    const activity = {
      kind: "bits",
      title: "Build minus five",
      bit_width: 8,
      initial: 0,
      target_value: -5,
      interpretation: "twos-complement",
      explanation: "The eight-bit pattern is 11111011.",
    };
    expect(parseConceptActivity(JSON.stringify(activity))?.kind).toBe("bits");
    expect(parseConceptActivity(JSON.stringify({ ...activity, target_value: -129 }))).toBeNull();
    expect(
      parseConceptActivity(JSON.stringify({ ...activity, interpretation: "unsigned" })),
    ).toBeNull();
    expect(parseConceptActivity(JSON.stringify({ ...activity, initial: 256 }))).toBeNull();
  });
  it("computes the motor model and respects arithmetic precedence", () => {
    expect(evaluateConceptExpression("V-Ia*Ra", { V: 220, Ia: 10, Ra: 0.5 })).toBe(215);
    expect(evaluateConceptExpression("Ia^2*Ra", { Ia: 10, Ra: 0.5 })).toBe(50);
    expect(evaluateConceptExpression("-2^2 + 2^3^2", {})).toBe(508);
    expect(evaluateConceptExpression("sqrt(9) + sin(pi/2) + 1e-3", {})).toBeCloseTo(4.001);
    expect(evaluateConceptExpression("1 / (1 + x)", { x: 1 })).toBe(0.5);
  });

  it("refuses code, unknown names, singularities and excessive nesting", () => {
    for (const expression of [
      "window.alert(1)",
      "constructor(1)",
      "1;2",
      "x[0]",
      "unknown+1",
      "1/0",
      "sqrt(-1)",
      "2**3",
      "-".repeat(300) + "1",
      "(".repeat(100) + "1" + ")".repeat(100),
    ])
      expect(evaluateConceptExpression(expression, {}), expression).toBeNull();
  });

  it("rejects invalid slider ranges and undefined initial outputs", () => {
    const lab = fixture.sections[2].activities[0];
    expect(
      parseConceptActivity(
        JSON.stringify({
          ...lab,
          parameters: [{ id: "V", label: "V", min: 10, max: 1, step: 1, initial: 5 }],
        }),
      ),
    ).toBeNull();
    expect(
      parseConceptActivity(
        JSON.stringify({ ...lab, outputs: [{ label: "Bad", expression: "missing+1" }] }),
      ),
    ).toBeNull();
  });
});
