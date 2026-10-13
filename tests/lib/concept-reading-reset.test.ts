import { describe, expect, it } from "vitest";
import {
  CONCEPT_READING_VERSION,
  isCurrentConceptReading,
  resetSavedConceptReading,
  resetPooledConceptReading,
  pruneCachedConceptQueries,
} from "@/lib/concept-reading-version";

describe("resetting concepts without resetting a student's challenge", () => {
  it("clears only the lesson and its translation", () => {
    const original = {
      provider: "collection-challenge-v1",
      lesson: {
        title: "Notes",
        content: ["Old reading"],
        focus: "Old focus",
        bigIdea: "Old idea",
        sources: [{ title: "Old source" }],
      },
      solvedExamples: [{ solution: "Keep the working" }],
      examQuestions: [{ answerSealed: "Keep the sitting" }],
      romanNepali: {
        sourceHash: "old",
        reading: ["Old translation"],
        solutions: { q1: "Keep the translated answer" },
      },
      readingError: "Old error",
    };
    const fresh = resetSavedConceptReading(original);
    expect(fresh?.lesson).toMatchObject({ content: [], focus: "", bigIdea: "", sources: [] });
    expect(fresh?.solvedExamples).toBe(original.solvedExamples);
    expect(fresh?.examQuestions).toBe(original.examQuestions);
    expect(fresh?.romanNepali).toMatchObject({
      reading: [],
      sourceHash: "",
      solutions: original.romanNepali.solutions,
    });
    expect(original.lesson.content).toEqual(["Old reading"]);
    expect(fresh?.readingError).toBeNull();
  });

  it("removes only the reading from a pooled bank", () => {
    const bank = {
      reading: { content: "Old" },
      solved: ["Keep"],
      past_questions: ["Keep"],
      topics: ["Keep"],
    };
    expect(resetPooledConceptReading(bank)).toEqual({ ...bank, reading: null });
    expect(resetSavedConceptReading(null)).toBeNull();
  });

  it("requires the current version and an interactive activity", () => {
    expect(
      isCurrentConceptReading({
        content_version: CONCEPT_READING_VERSION,
        content: "```concept-activity\n{}\n```",
      }),
    ).toBe(true);
    expect(isCurrentConceptReading({ content_version: "old", content: "Old notes" })).toBe(false);
    expect(
      isCurrentConceptReading({ content_version: CONCEPT_READING_VERSION, content: "Plain notes" }),
    ).toBe(false);
  });

  it("prunes old reading queries without dropping unrelated data", () => {
    const cache = {
      timestamp: 10,
      clientState: {
        mutations: [],
        queries: [
          { queryKey: ["student", "revision", "topic", "v1", "c1"] },
          { queryKey: ["student", "challenges", "content", "c1"] },
          { queryKey: ["student", "revision", "topic", CONCEPT_READING_VERSION, "c1"] },
          { queryKey: ["account", "detail"] },
          { queryKey: ["chat", "sessions"] },
        ],
      },
    };
    expect(pruneCachedConceptQueries(cache).clientState.queries).toEqual(
      cache.clientState.queries.slice(2),
    );
    expect(cache.clientState.queries).toHaveLength(5);
  });
});
