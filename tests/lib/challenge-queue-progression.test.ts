import { describe, expect, it } from "vitest";
import { dailyChallengeAssignmentCount } from "@/lib/data/student-challenges";

/**
 * The queue is three challenges on your plate, and solving one lets the next
 * arrive. It used to be three ISSUED per day — so a student who finished all
 * three was done until tomorrow, and one whose three happened to be other
 * subjects saw nothing under a subject they had filtered to.
 *
 * Measured on the live data at the time: 39 rows across 12 students, every one
 * of them at the ceiling.
 */
describe("how many challenges the queue hands out", () => {
  const free = { availableCount: 50, maximumDailyCount: 3 };

  it("fills an empty plate", () => {
    expect(
      dailyChallengeAssignmentCount({
        ...free,
        activeCount: 0,
        activeRecommendationCount: 0,
        dailyCount: 0,
      }),
    ).toBe(3);
  });

  it("releases the next one as soon as a challenge is solved", () => {
    // Three issued today, two still open: the solved one freed a slot.
    expect(
      dailyChallengeAssignmentCount({
        ...free,
        activeCount: 2,
        activeRecommendationCount: 2,
        dailyCount: 2,
      }),
    ).toBe(1);
  });

  it("does not stack more than three open at once", () => {
    expect(
      dailyChallengeAssignmentCount({
        ...free,
        activeCount: 3,
        activeRecommendationCount: 3,
        dailyCount: 3,
      }),
    ).toBe(0);
  });

  it("gives a filtered subject its own allocation", () => {
    // A student who filters to Basic Electrical Engineering, whose three open
    // challenges are all other subjects, must not be shown an empty hub telling
    // them to ask the creator to refresh topics.
    expect(
      dailyChallengeAssignmentCount({
        ...free,
        activeCount: 3,
        activeRecommendationCount: 0,
        minimumRecommendationCount: 3,
        dailyCount: 3,
      }),
    ).toBe(3);
  });

  it("still ceilings the filtered subject, so filters cannot stack a pile", () => {
    expect(
      dailyChallengeAssignmentCount({
        ...free,
        activeCount: 5,
        activeRecommendationCount: 3,
        minimumRecommendationCount: 3,
        dailyCount: 5,
      }),
    ).toBe(0);
  });

  it("opens one per subject when the semester has more subjects than the flat three", () => {
    // Four subjects this semester: a flat ceiling of three showed three cards
    // and left the fourth subject looking like it had nothing to study.
    expect(
      dailyChallengeAssignmentCount({
        availableCount: 50,
        activeCount: 0,
        activeRecommendationCount: 0,
        dailyCount: 0,
        concurrentChallengeLimit: 4,
        maximumDailyCount: 4,
      }),
    ).toBe(4);
  });

  it("keeps three as the floor for a one-subject semester", () => {
    expect(
      dailyChallengeAssignmentCount({
        ...free,
        activeCount: 0,
        activeRecommendationCount: 0,
        dailyCount: 0,
        concurrentChallengeLimit: 1,
      }),
    ).toBe(3);
  });

  it("never offers more than the catalogue has", () => {
    expect(
      dailyChallengeAssignmentCount({
        availableCount: 1,
        maximumDailyCount: 3,
        activeCount: 0,
        activeRecommendationCount: 0,
        dailyCount: 0,
      }),
    ).toBe(1);
  });
});
