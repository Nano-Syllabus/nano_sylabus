import { describe, expect, it } from "vitest";
import {
  aggregateCommunityDailyActivity,
  calculateActivityStreak,
  communityDateKey,
  documentBelongsToSubject,
} from "@/lib/data/community-hub";

describe("community hub calculations", () => {
  it("uses the Kathmandu calendar date", () => {
    expect(communityDateKey("2026-09-01T18:20:00.000Z")).toBe("2026-09-02");
  });

  it("counts a completion streak from today or yesterday", () => {
    const now = new Date("2026-09-02T06:00:00.000Z");
    expect(
      calculateActivityStreak(
        [
          { activity_date: "2026-09-02", completed_count: 1 },
          { activity_date: "2026-09-01", completed_count: 2 },
          { activity_date: "2026-08-31", completed_count: 1 },
          { activity_date: "2026-08-29", completed_count: 3 },
        ],
        now,
      ),
    ).toBe(3);
  });

  it("aggregates only the community-scoped challenge attempts supplied by the loader", () => {
    expect(
      aggregateCommunityDailyActivity([
        { user_id: "student-1", created_at: "2026-09-01T18:20:00.000Z", passed: true },
        { user_id: "student-1", created_at: "2026-09-01T19:20:00.000Z", passed: false },
        { user_id: "student-2", created_at: "2026-09-01T20:20:00.000Z", passed: true },
      ]),
    ).toEqual([
      {
        user_id: "student-1",
        activity_date: "2026-09-02",
        attempt_count: 2,
        completed_count: 1,
      },
      {
        user_id: "student-2",
        activity_date: "2026-09-02",
        attempt_count: 1,
        completed_count: 1,
      },
    ]);
  });

  it("scopes teacher files to the linked subject folder", () => {
    const subject = {
      teacherId: "teacher-1",
      folderPath: "Attention is all you need",
      name: "Attention is all you need",
    };
    expect(
      documentBelongsToSubject(
        {
          teacher_id: "teacher-1",
          collection_path: "Attention is all you need/Question Bank/paper.pdf",
        },
        subject,
      ),
    ).toBe(true);
    expect(
      documentBelongsToSubject(
        { teacher_id: "teacher-2", collection_path: "Attention is all you need/Notes/note.pdf" },
        subject,
      ),
    ).toBe(false);
  });
});
