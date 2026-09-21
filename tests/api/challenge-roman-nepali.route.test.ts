import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), romanNepali: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ source: "session-client" }),
}));
vi.mock("@/lib/supabase/verified-user", () => ({ getVerifiedUser: mocks.user }));
vi.mock("@/lib/data/student-challenges", () => ({ getStudentChallengeRomanNepali: mocks.romanNepali }));

import { GET } from "@/app/api/student/challenges/[challengeId]/roman-nepali/route";

const call = () => GET(new Request("http://localhost/x"), { params: Promise.resolve({ challengeId: "c1" }) });

describe("GET a challenge in Roman Nepali", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ data: { user: { id: "student" } } });
    mocks.romanNepali.mockResolvedValue({ sourceHash: "h", reading: ["RN"], solutions: {}, untranslated: 0 });
  });

  it("returns the signed-in student's translation", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      romanNepali: { sourceHash: "h", reading: ["RN"], solutions: {}, untranslated: 0 },
    });
    expect(mocks.romanNepali).toHaveBeenCalledWith("student", "c1");
  });

  it("requires a signed-in student, and their own challenge", async () => {
    mocks.user.mockResolvedValue({ data: { user: null } });
    expect((await call()).status).toBe(401);
    mocks.user.mockResolvedValue({ data: { user: { id: "student" } } });
    mocks.romanNepali.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it("says it is showing English when the translation fails, without leaking why", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.romanNepali.mockRejectedValue(new Error("TeacherApiError 502 upstream secret detail"));
    const response = await call();
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBe("This couldn't be put into Roman Nepali right now. Showing English.");
  });
});
