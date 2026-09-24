import { describe, expect, it } from "vitest";
import { mergeLearnQuestions } from "@/lib/challenge-learn-questions";

/**
 * Step one is one list: this subject's own questions on the subtopic, each
 * opening onto its answer. The two content fields behind it are the same rows
 * seen twice — `solvedExamples` ARE past questions carrying a solution — and
 * they share no id, so the question text is the join.
 */

const past = (question: string, year = "", marks: number | null = null) => ({
  id: `past-${question.slice(0, 6)}-${year}`,
  question,
  topic: "Free oscillation",
  topicKey: "free_oscillation",
  marks,
  year,
});

// `marks` is a number on a worked example, never null: 0 means the bank printed none.
const solved = (question: string, solution: string, year = "", marks = 0) => ({
  question,
  solution,
  year,
  marks,
  topic: "Free oscillation",
  grounded: true,
  source: "question_bank" as const,
});

describe("the question list step one renders", () => {
  it("puts the solution on the question instead of listing it twice", () => {
    const list = mergeLearnQuestions({
      solvedExamples: [solved("What is LC oscillation? Derive its differential equation.", "It is …", "IOE 2075 Ashwin")],
      // The same question as the bank prints it: different case, trailing
      // punctuation, and no solution.
      pastQuestions: [past("What is LC oscillation? Derive its differential equation.  ", "IOE 2075 Ashwin")],
    });

    expect(list).toHaveLength(1);
    expect(list[0].solution).toBe("It is …");
    // The worked copy's wording wins — it is the one that was written out.
    expect(list[0].question).toBe("What is LC oscillation? Derive its differential equation.");
  });

  it("shows the typeset question but matches the two sources on the bank's wording", () => {
    const plain = "Solve the equation x(d^2y/dx^2) + (x^2-4)y = 0 in series form.";
    const typeset = "Solve the equation $x\\frac{d^2y}{dx^2} + (x^2-4)y = 0$ in series form.";
    const list = mergeLearnQuestions({
      solvedExamples: [{ ...solved(plain, "### Frobenius method", "2069 Poush"), displayQuestion: typeset }],
      pastQuestions: [past(plain, "2069 Poush")],
    });

    expect(list).toHaveLength(1);
    expect(list[0].question).toBe(plain);
    expect(list[0].displayQuestion).toBe(typeset);
    expect(list[0].solution).toBe("### Frobenius method");
  });

  it("does not call a question repeated because it was also worked", () => {
    // Seen as "★ Repeated ×2" beside a single "2079 Jestha": the worked copy
    // was counted as a second printing.
    const text = "Explain inclusive and exclusive disjunction with truth table and examples.";
    const [only] = mergeLearnQuestions({
      solvedExamples: [solved(text, "A table.", "2079 Jestha")],
      pastQuestions: [past(text, "2079 Jestha")],
    });

    expect(only.appearances).toBe(1);
    expect(only.years).toEqual(["2079 Jestha"]);
  });

  it("shows every session the bank printed a question in", () => {
    const text = "State and prove De Morgan's laws with a truth table.";
    const [only] = mergeLearnQuestions({
      pastQuestions: [{ ...past(text, "2079 Jestha"), years: ["2071 Bhadra", "2075 Ashwin", "2079 Jestha"] }],
    });

    expect(only.years).toEqual(["2071 Bhadra", "2075 Ashwin", "2079 Jestha"]);
    expect(only.appearances).toBe(3);
  });

  it("collapses repeat appearances into one question carrying its years", () => {
    const list = mergeLearnQuestions({
      pastQuestions: [
        past("Derive the differential equation of free oscillation.", "IOE 2075 Ashwin"),
        past("Derive the differential equation of free oscillation.", "IOE 2069"),
        past("Derive the differential equation of free oscillation", "2072 Ashwin"),
      ],
    });

    expect(list).toHaveLength(1);
    expect(list[0].appearances).toBe(3);
    expect(list[0].years).toEqual(["IOE 2075 Ashwin", "IOE 2069", "2072 Ashwin"]);
  });

  it("keeps every mark value the bank printed, and none it did not", () => {
    const list = mergeLearnQuestions({
      pastQuestions: [
        past("Explain forced oscillation and its differential equation.", "IOE 2069", 4),
        past("Explain forced oscillation and its differential equation.", "IOE 2075 Ashwin", 2),
        // No marks printed: nothing to add, and nothing to invent.
        past("Explain forced oscillation and its differential equation.", "2072 Ashwin", null),
      ],
    });

    expect(list[0].marks).toEqual([4, 2]);
  });

  it("leads with the worked questions, then the most repeated", () => {
    const list = mergeLearnQuestions({
      solvedExamples: [solved("Derive the equation of a worked case.", "Solution")],
      pastQuestions: [
        past("Explain resonance in a driven circuit.", "IOE 2069"),
        past("Define the quality factor of an oscillator.", "IOE 2069"),
        past("Define the quality factor of an oscillator.", "IOE 2075 Ashwin"),
      ],
    });

    expect(list.map((item) => item.question)).toEqual([
      "Derive the equation of a worked case.",
      "Define the quality factor of an oscillator.",
      "Explain resonance in a driven circuit.",
    ]);
  });

  it("drops a row with no question text rather than rendering an empty card", () => {
    const list = mergeLearnQuestions({ pastQuestions: [past("   "), past("State Sabine's law for a hall.")] });

    expect(list.map((item) => item.question)).toEqual(["State Sabine's law for a hall."]);
  });

  it("returns nothing at all when the challenge has no content yet", () => {
    expect(mergeLearnQuestions({})).toEqual([]);
  });
});

/**
 * A challenge keeps the questions it was built with, so a row built before the
 * question bank was indexed still carries what the old request-time scraper
 * pulled off the scan. The list refuses to render the wreckage.
 */
describe("questions a stored challenge should not show", () => {
  const shown = (question: string) =>
    mergeLearnQuestions({ pastQuestions: [past(question, "IOE 2069")] }).map((item) => item.question);

  it("drops a line that starts mid-sentence", () => {
    expect(shown("yri the oscillator is lost ineach full oscillation?")).toEqual([]);
    expect(shown("period of the oscillation? '")).toEqual([]);
  });

  it("drops a question the chunk boundary cut", () => {
    expect(
      shown("What is LC oscillation? Derive the differential equation of free oscillation and compare"),
    ).toEqual([]);
    expect(shown("Explain forced oscillation with its equation. Write the relation for the")).toEqual([]);
  });

  it("keeps a whole question, punctuated or not", () => {
    expect(shown("Derive the differential equation of free oscillation.")).toHaveLength(1);
    expect(shown("Design a combinational logic that performs multiplication between two 4 bit numbers")).toHaveLength(1);
  });

  it("marks a question written from the notes as not from a past paper", () => {
    const text = "Evaluate the performance trade-offs between arrays and linked lists.";
    const [generated] = mergeLearnQuestions({
      solvedExamples: [
        { ...solved(text, "Arrays …"), grounded: false, source: "generated_from_notes" as const },
      ],
    });
    const [printed] = mergeLearnQuestions({
      solvedExamples: [solved(text, "Arrays …", "IOE 2079 Jestha")],
    });

    expect(generated).toMatchObject({ fromPastPaper: false, years: [] });
    expect(printed).toMatchObject({ fromPastPaper: true, years: ["IOE 2079 Jestha"] });
  });

  it("counts a bank row as a past paper even when its worked copy was generated", () => {
    const text = "Evaluate the performance trade-offs between arrays and linked lists.";
    const [item] = mergeLearnQuestions({
      solvedExamples: [
        { ...solved(text, "Arrays …"), grounded: false, source: "generated_from_notes" as const },
      ],
      pastQuestions: [past(text, "2078 Baisakh")],
    });

    expect(item).toMatchObject({ fromPastPaper: true, years: ["2078 Baisakh"] });
  });
});
