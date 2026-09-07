import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ challenge: vi.fn(), hub: vi.fn() }));
vi.mock("@/lib/data/student-challenge-dashboard", () => ({
  getStudentChallengeDashboard: mocks.challenge,
}));
vi.mock("@/lib/data/community-hub", () => ({
  getCommunityHubForUser: mocks.hub,
  communityDateKey: () => "2026-09-07",
}));
import { getStudentDailyDashboard } from "@/lib/data/student-daily-dashboard";

describe("Daily Dashboard community isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hub.mockResolvedValue(null);
  });

  it("uses the authorized selected community for both the hub and activity calendar", async () => {
    mocks.challenge.mockResolvedValue({
      community: { slug: "owned", courseId: "owned-course" },
      todayCompletedCount: 2,
    });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const admin = { from: vi.fn().mockReturnValue(query) };
    const result = await getStudentDailyDashboard("owner", admin as never, "owned");
    expect(mocks.challenge).toHaveBeenCalledWith("owner", 1, undefined, "owned");
    expect(mocks.hub).toHaveBeenCalledWith("owner", admin, "owned");
    expect(query.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(query.eq).toHaveBeenCalledWith("course_id", "owned-course");
    expect(result.todayChallengeCompletions).toBe(2);
  });

  it("does not query another community's activity when the selected course is not ready", async () => {
    mocks.challenge.mockResolvedValue({
      community: { slug: "new-owned", courseId: null },
      todayCompletedCount: 0,
    });
    const admin = { from: vi.fn() };
    const result = await getStudentDailyDashboard("owner", admin as never, "new-owned");
    expect(admin.from).not.toHaveBeenCalled();
    expect(mocks.hub).toHaveBeenCalledWith("owner", admin, "new-owned");
    expect(result.activity.every((day) => day.attempts === 0)).toBe(true);
  });
});
