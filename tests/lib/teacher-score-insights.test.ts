import { describe, expect, it } from "vitest";
import { aheadOfCount, gradeTopicEvaluation, scoreDistribution } from "@/lib/teacher-score-insights";

describe("teacher score insights", () => {
  const grades = [
    { total_score: 3, total_marks: 10 },
    { total_score: 5, total_marks: 10 },
    { total_score: 7, total_marks: 10 },
    { total_score: 9, total_marks: 10 },
  ];

  it("builds stable score bands and peer comparison", () => {
    expect(scoreDistribution(grades)).toEqual({ total: 4, bands: [{ label: "Below 40%", count: 1 }, { label: "40–59%", count: 1 }, { label: "60–79%", count: 1 }, { label: "80–100%", count: 1 }] });
    expect(aheadOfCount(grades, grades[2])).toEqual({ aheadOf: 2, comparedWith: 3, percentage: 70 });
  });

  it("normalizes chapter evaluation returned by the Practice API", () => {
    expect(gradeTopicEvaluation({ evaluation: { chapters: [{ chapter: "Logic gates", score: 3, total_marks: 5, weightage: 25, lost_weightage: 10, status: "developing" }], strong_topics: ["Boolean algebra"], weak_topics: [{ chapter: "Logic gates" }] } })).toEqual({
      topics: [{ name: "Logic gates", earned: 3, marks: 5, percentage: 60, weightage: 25, lostWeightage: 10, status: "developing" }],
      strongTopics: ["Boolean algebra"],
      weakTopics: ["Logic gates"],
    });
  });
});
