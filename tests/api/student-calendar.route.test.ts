import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), calendar: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ source: "session-client" }),
}));
vi.mock("@/lib/supabase/verified-user", () => ({
  getVerifiedUser: mocks.user,
}));
vi.mock("@/lib/data/student-daily-dashboard", () => ({
  getStudentCalendarMonth: mocks.calendar,
}));

import { GET } from "@/app/api/student/calendar/route";

describe("GET student calendar month", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ data: { user: { id: "student" } } });
    mocks.calendar.mockResolvedValue([{ date: "2026-10-01" }]);
  });

  it("loads only the requested calendar month in the selected community", async () => {
    const response = await GET(
      new Request("http://localhost/api/student/calendar?month=2026-10&community=bct"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ activity: [{ date: "2026-10-01" }] });
    expect(mocks.calendar).toHaveBeenCalledWith("student", undefined, "bct", "2026-10");
  });

  it("rejects a malformed month before querying data", async () => {
    const response = await GET(new Request("http://localhost/api/student/calendar?month=October"));
    expect(response.status).toBe(400);
    expect(mocks.calendar).not.toHaveBeenCalled();
  });

  it("requires an authenticated user", async () => {
    mocks.user.mockResolvedValue({ data: { user: null } });
    const response = await GET(new Request("http://localhost/api/student/calendar?month=2026-10"));
    expect(response.status).toBe(401);
    expect(mocks.calendar).not.toHaveBeenCalled();
  });
});
