import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import fixture from "@/tests/fixtures/concept-microbook.json";
import { ConceptsDrawer, readingBlocks, readingChapter } from "@/components/concepts-reading";
import { ConceptActivityCard } from "@/components/concept-activity";
import { spreadLabels } from "@/components/concept-figure";
import {
  blankMatches,
  evaluateConceptExpression,
  parseConceptActivity,
  conceptProgressKey,
} from "@/lib/concept-activities";
import { lessonParagraphsForTest } from "@/lib/data/student-challenges";
import { readStudyWork, observedTrend } from "@/lib/concept-study";

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
    expect(html).toContain('aria-label="Chapter sections"');
    expect(html).toContain("Show next step");
    expect(html).toContain(">Check</button>");
    expect(html).toContain("Model answer");
    expect(html).toContain("0 of 6 activities");
    expect(html).not.toContain("concept-activity\n");
    expect(html).not.toContain("&quot;answer_index&quot;");
    // App typography now: no ruled paper, no handwriting picker, no recall covers.
    expect(html).not.toContain("answer-paper");
    expect(html).not.toContain("Handwriting font");
    expect(html).not.toContain("Recall from your notes");
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

describe("the micro-book chapter", () => {
  const chapterReading = [
    "**Why it matters:** DC motors drive lifts and vehicles.",
    "**Be ready for:**\n- \"Derive the torque equation.\"\n- A numerical on back EMF.",
    "**The idea:** Current in a field feels a force.",
    "### 1. Back EMF",
    "*A spinning armature generates a voltage that opposes the supply.*",
    "- Back EMF rises with speed.",
    "$$\nE_b = \\frac{P\\phi Z N}{60A}\n$$",
    "**Worked:** Eb = 160 V.",
    "**Exam tip:** Choose A from the winding type.",
    '```concept-activity\n{"kind":"blanks","title":"Fill","blanks":[{"before":"Lap winding has A =","answer":"P"}]}\n```',
    "### Exam practice",
    '```concept-activity\n{"kind":"choice","title":"Wave","options":["doubles","halves"],"answer_index":0,"explanation":"A halves."}\n```',
    "### Formulas to have in hand",
    "- $E_b = V - I_a R_a$",
    "### Common mistakes",
    "- Using V instead of Eb.",
  ];

  it("reads the opening and types every piece of a section", () => {
    const chapter = readingChapter(chapterReading);
    expect(chapter.why).toBe("DC motors drive lifts and vehicles.");
    expect(chapter.ready).toEqual(['"Derive the torque equation."', "A numerical on back EMF."]);
    expect(chapter.idea).toBe("Current in a field feels a force.");
    expect(chapter.sections.map((s) => [s.number, s.title, s.role])).toEqual([
      [1, "Back EMF", "lesson"],
      [null, "Exam practice", "practice"],
      [null, "Formulas to have in hand", "formulas"],
      [null, "Common mistakes", "mistakes"],
    ]);
    expect(chapter.sections[0].pieces.map((p) => p.kind)).toEqual([
      "lead", "text", "formula", "example", "tip", "activity",
    ]);
  });

  it("draws the chapter: the idea, numbered sections, tips and a progress rail, no question list", () => {
    const html = renderToStaticMarkup(
      createElement(ConceptsDrawer, {
        source: { id: "motor", title: "DC motor", subjectName: "BEE", reading: chapterReading },
        onClose() {},
      }),
    );
    // No column of exam questions above the lesson (user, 2026-10-15).
    expect(html).not.toContain("Be ready for");
    expect(html).toContain("The idea");
    expect(html).toContain("Exam tip.");
    expect(html).toContain("Worked example");
    expect(html).toContain('data-concept-activity="blanks"');
    expect(html).toContain("Check blanks");
    expect(html).toContain("0 of 2 activities");
    expect(html).not.toContain("**Exam tip:**");
    expect(html.indexOf("The idea")).toBeLessThan(html.indexOf("Back EMF</h3>"));
  });

  it("still draws an older reading with none of the labels", () => {
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
    expect(html).toContain("Resistance is measured in ohms.");
    expect(html).not.toContain("data-concept-activity=");
  });

  it("accepts a blank's other spellings and ignores case, spacing and markup", () => {
    const item = { answer: "Φ", accept: ["phi", "flux per pole"] };
    for (const typed of ["Φ", "ϕ", " PHI ", "flux per pole", "$\\Phi$"]) expect(blankMatches(typed, item)).toBe(true);
    for (const typed of ["", "P", "flux"]) expect(blankMatches(typed, item)).toBe(false);
  });
});

describe("learning from the existing notes", () => {
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

describe("figures and graphs", () => {
  const figure = {
    kind: "figure",
    title: "Moving a force",
    prompt: "Tap each part.",
    items: [
      { type: "rect", x1: 200, y1: 150, x2: 400, y2: 170, tone: "fill", part: "body" },
      { type: "arrow", x1: 250, y1: 60, x2: 250, y2: 150, tone: "accent", part: "force" },
      { type: "text", x1: 260, y1: 70, text: "F = 500 N", tone: "accent", part: "force" },
      { type: "polyline", points: "180,170 420,170", part: "ground" },
    ],
    figure_parts: [
      { id: "body", label: "Rigid body", description: "The body the force acts on." },
      { id: "force", label: "Force F", description: "500 N, downward." },
      { id: "ground", label: "Support", description: "Holds the body." },
    ],
    explanation: "A force on a supported body.",
  };

  it("draws a figure from data, with every part explorable", () => {
    const activity = parseConceptActivity(JSON.stringify(figure));
    expect(activity?.kind).toBe("figure");
    const html = renderToStaticMarkup(
      createElement(ConceptActivityCard, { activity: activity!, complete: false, onComplete() {} }),
    );
    expect(html).toContain('data-concept-activity="figure"');
    expect(html).toContain("<svg");
    expect(html).toContain("F = 500 N");
    for (const label of ["Explore Rigid body", "Explore Force F", "Explore Support"]) expect(html).toContain(label);
    expect(html).toContain("Parts explored: 0 of 3");
  });

  it("refuses a figure part that is drawn nowhere it points", () => {
    const bad = { ...figure, items: [...figure.items, { type: "line", x1: 0, y1: 0, x2: 10, y2: 10, part: "ghost" }] };
    expect(parseConceptActivity(JSON.stringify(bad))).toBeNull();
  });

  it("slides overlapping labels apart and keeps them on the canvas", () => {
    const [a, b, c] = spreadLabels([
      { type: "text", x1: 300, y1: 50, x2: 0, y2: 0, points: "", text: "F = 300 N", tone: "accent", dashed: false, part: "" },
      { type: "text", x1: 310, y1: 52, x2: 0, y2: 0, points: "", text: "Line of action", tone: "ink", dashed: false, part: "" },
      { type: "text", x1: 590, y1: 200, x2: 0, y2: 0, points: "", text: "Long label at the edge", tone: "ink", dashed: false, part: "" },
    ]);
    expect(a.y1).toBe(50);
    expect(b.y1).toBeGreaterThan(50 + 18);
    expect(c.x1 + c.text.length * 18 * 0.62).toBeLessThanOrEqual(598);
  });

  it("draws a lab's graph live, with axes, the curve and the current setting", () => {
    const lab = parseConceptActivity(
      JSON.stringify({
        kind: "experiment",
        title: "Couple moment",
        parameters: [
          { id: "F", label: "Force", unit: "N", min: 10, max: 100, step: 5, initial: 50 },
          { id: "d", label: "Separation", unit: "m", min: 0.1, max: 1, step: 0.05, initial: 0.4 },
        ],
        outputs: [{ label: "Moment M", expression: "F*d", unit: "N m" }],
        plot: { x: "d", y: 0 },
        explanation: "M = F d.",
      }),
    );
    const html = renderToStaticMarkup(
      createElement(ConceptActivityCard, { activity: lab!, complete: false, onComplete() {} }),
    );
    expect(html).toContain('aria-label="Moment M (N m) against Separation (m). Drag along the graph');
    // The graph is a control: switch the axis between sliders, drag to set the value.
    expect(html).toContain('aria-label="Plot against"');
    expect(html).toContain("Drag along the graph to change separation");
    expect(html).toContain("Back to the starting values");
    expect(html).toContain("<path");
    expect(html).toContain("<circle");
    expect(html).toContain("20 N m"); // 50 N x 0.4 m, shown before anything is moved
    expect(html).toContain("Move 2 different controls");
    expect(html).not.toContain("disabled");
  });
});

