import { describe, expect, it } from "vitest";
import {
  retiredTopicRows,
  type ChallengeRecommendation,
} from "@/lib/data/student-challenges";

/**
 * A syllabus gets re-read, and a unit stops being a thing a student sits down to
 * learn: "Oscillation" becomes the week that contains "Mechanical Oscillation:
 * Introduction", "Free oscillation" and four more. The provider already stops
 * OFFERING the unit at that point — but a challenge assigned before the re-read
 * keeps its key, keeps one of the three daily slots, and keeps showing a whole
 * unit in a column headed Subtopic. This is what retires it.
 */

function recommendation(
  topicKey: string,
  overrides: Partial<ChallengeRecommendation> = {},
): ChallengeRecommendation {
  return {
    courseId: "course-1",
    subjectSlug: "engineering_physics",
    subjectName: "Engineering Physics",
    namespace: "Engineering Physics",
    topicKey,
    topicTitle: topicKey,
    topicBlurb: "",
    unitNumber: "1",
    reason: "",
    ...overrides,
  };
}

function row(id: string, topicKey: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    course_id: "course-1",
    subject_slug: "engineering_physics",
    topic_key: topicKey,
    status: "started",
    ...overrides,
  };
}

describe("retiring challenges whose topic the syllabus no longer offers", () => {
  const catalogue = [
    recommendation("mechanical-oscillation-introduction"),
    recommendation("free-oscillation"),
  ];

  it("retires a unit that has been re-read into its own bullets", () => {
    const retired = retiredTopicRows(
      [row("stale", "oscillation"), row("live", "free-oscillation")],
      catalogue,
    );

    expect(retired.has("stale")).toBe(true);
    expect(retired.has("live")).toBe(false);
  });

  it("matches the key case-insensitively, as the assignment does", () => {
    expect(retiredTopicRows([row("live", "Free-Oscillation")], catalogue).size).toBe(0);
  });

  it("leaves a subject today's recommendations do not cover alone", () => {
    // Not in scope is not the same as not taught. A subject with no catalogue in
    // this call has nothing here to be missing from, and retiring its rows on the
    // strength of that silence would delete a student's queue every time they
    // switched community.
    const retired = retiredTopicRows(
      [row("other", "anything", { subject_slug: "applied_mechanics" })],
      catalogue,
    );

    expect(retired.size).toBe(0);
  });

  it("scopes the catalogue per subject rather than pooling every key", () => {
    // "introduction" is a real subtopic of Applied Mechanics and not of Physics.
    // Pooling the keys would keep a Physics row alive on the strength of a topic
    // belonging to another subject entirely.
    const retired = retiredTopicRows(
      [row("physics", "introduction")],
      [
        ...catalogue,
        recommendation("introduction", {
          subjectSlug: "applied_mechanics",
          subjectName: "Applied Mechanics",
        }),
      ],
    );

    expect(retired.has("physics")).toBe(true);
  });
});
