import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ scope: vi.fn() }));

vi.mock("@/lib/student-courses", () => ({
  getStudentCommunityLearningScope: mocks.scope,
}));

import { getStudentCalendarMonth } from "@/lib/data/student-daily-dashboard";

describe("student calendar month data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scope.mockResolvedValue({ courseId: "course-1" });
  });

  it("queries only the selected community course and requested Kathmandu month", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const admin = { from: vi.fn(() => query) };

    const activity = await getStudentCalendarMonth("student", admin as never, "bct", "2026-10");

    expect(mocks.scope).toHaveBeenCalledWith("student", admin, { communitySlug: "bct" });
    expect(query.eq).toHaveBeenCalledWith("user_id", "student");
    expect(query.eq).toHaveBeenCalledWith("course_id", "course-1");
    expect(query.gte).toHaveBeenCalledWith("created_at", "2026-09-30T18:15:00.000Z");
    expect(query.lt).toHaveBeenCalledWith("created_at", "2026-10-31T18:15:00.000Z");
    expect(activity).toHaveLength(31);
    expect(activity[0].date).toBe("2026-10-01");
  });

  it("returns an empty month without querying attempts when no study course exists", async () => {
    mocks.scope.mockResolvedValue({ courseId: null });
    const admin = { from: vi.fn() };

    const activity = await getStudentCalendarMonth("student", admin as never, "bct", "2026-10");

    expect(admin.from).not.toHaveBeenCalled();
    expect(activity).toHaveLength(31);
    expect(activity.every((day) => day.attempts === 0)).toBe(true);
  });
});
