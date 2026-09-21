import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), register: vi.fn(), profile: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ source: "session-client" }),
}));
vi.mock("@/lib/supabase/verified-user", () => ({ getVerifiedUser: mocks.user }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }),
  }),
}));
vi.mock("@/lib/data/cash-prize-weekly", () => ({ registerWeeklyParticipation: mocks.register }));

import { POST } from "@/app/api/student/cash-prize/participate/route";

describe("POST cash prize participation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({
      data: { user: { id: "student", email: "asha@example.com", user_metadata: {} } },
    });
    mocks.profile.mockResolvedValue({ data: { full_name: "Asha Rai" } });
    mocks.register.mockResolvedValue({
      ok: true,
      drawDate: "2026-09-25",
      entries: 2,
      confirmedAt: "2026-09-21T06:00:00.000Z",
    });
  });

  it("registers the signed-in student under their profile name", async () => {
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      participation: { drawDate: "2026-09-25", entries: 2, confirmedAt: "2026-09-21T06:00:00.000Z" },
    });
    expect(mocks.register).toHaveBeenCalledWith("student", { name: "Asha Rai", email: "asha@example.com" });
  });

  it("falls back to the email name when the student has no profile name", async () => {
    mocks.profile.mockResolvedValue({ data: null });
    await POST();
    expect(mocks.register).toHaveBeenCalledWith("student", { name: "asha", email: "asha@example.com" });
  });

  it("passes the server's refusal on as 403, with its reason", async () => {
    mocks.register.mockResolvedValue({
      ok: false,
      reason: "streak_incomplete",
      message: "Complete 2 more days of your streak to take part.",
    });
    const response = await POST();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Complete 2 more days of your streak to take part.",
      reason: "streak_incomplete",
    });
  });

  it("requires a signed-in student", async () => {
    mocks.user.mockResolvedValue({ data: { user: null } });
    const response = await POST();
    expect(response.status).toBe(401);
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("does not leak a database error to the student", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.register.mockRejectedValue(new Error('relation "cash_prize_weekly_entries" does not exist'));
    const response = await POST();
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("Your participation could not be confirmed. Please try again.");
  });
});
