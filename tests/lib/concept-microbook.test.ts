import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import fixture from "@/tests/fixtures/concept-microbook.json";
import { ConceptsDrawer, readingBlocks, readingChapter } from "@/components/concepts-reading";
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

  it("draws the chapter: be ready for, the idea, numbered sections, tips and a progress rail", () => {
    const html = renderToStaticMarkup(
      createElement(ConceptsDrawer, {
        source: { id: "motor", title: "DC motor", subjectName: "BEE", reading: chapterReading },
        onClose() {},
      }),
    );
    expect(html).toContain("Be ready for");
    expect(html).toContain("The idea");
    expect(html).toContain("Exam tip.");
    expect(html).toContain("Worked example");
    expect(html).toContain('data-concept-activity="blanks"');
    expect(html).toContain("Check blanks");
    expect(html).toContain("0 of 2 activities");
    expect(html).not.toContain("**Exam tip:**");
    expect(html.indexOf("Be ready for")).toBeLessThan(html.indexOf("Back EMF</h3>"));
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
