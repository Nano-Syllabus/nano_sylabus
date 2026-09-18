import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getVerifiedUser: vi.fn(),
  admin: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }));
vi.mock("@/lib/supabase/verified-user", () => ({ getVerifiedUser: mocks.getVerifiedUser }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));

import { POST } from "@/app/api/student/challenges/[challengeId]/feedback/route";

function adminWith(row: Record<string, unknown> | null, insertError: { code: string } | null = null) {
  const inserted: Array<Record<string, unknown>> = [];
  const select = {
    eq: () => select,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return {
    inserted,
    client: {
      from: (table: string) =>
        table === "student_challenges"
          ? { select: () => select }
          : {
              insert: async (values: Record<string, unknown>) => {
                inserted.push(values);
                return { error: insertError };
              },
            },
    },
  };
}

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/student/challenges/challenge-1/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ challengeId: "challenge-1" }) },
  );

describe("POST /api/student/challenges/[challengeId]/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseServerClient.mockResolvedValue({});
    mocks.getVerifiedUser.mockResolvedValue({ data: { user: { id: "student-1" } } });
  });

  it("stores both answers against the sitting the sheet went to", async () => {
    const admin = adminWith({ id: "challenge-1", external_paper_id: "chal_abc", last_attempt_id: null });
    mocks.admin.mockReturnValue(admin.client);

    const response = await post({ experienceRating: 4, expectedScoreBand: "51-75" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ stored: true });
    expect(admin.inserted).toEqual([{
      challenge_id: "challenge-1", user_id: "student-1", exam_attempt_id: "chal_abc",
      skipped: false, experience_rating: 4, expected_score_band: "51-75",
    }]);
  });

  it("records a skip as a skip", async () => {
    const admin = adminWith({ id: "challenge-1", external_paper_id: "chal_abc" });
    mocks.admin.mockReturnValue(admin.client);

    await post({ skipped: true });

    expect(admin.inserted[0]).toMatchObject({ skipped: true, experience_rating: null, expected_score_band: null });
  });

  it("refuses half an answer or an option the modal does not offer", async () => {
    mocks.admin.mockReturnValue(adminWith({ id: "challenge-1" }).client);

    expect((await post({ experienceRating: 4 })).status).toBe(400);
    expect((await post({ experienceRating: 9, expectedScoreBand: "0-25" })).status).toBe(400);
    expect((await post({ experienceRating: 3, expectedScoreBand: "50-60" })).status).toBe(400);
  });

  it("only takes feedback on the student's own challenge", async () => {
    mocks.admin.mockReturnValue(adminWith(null).client);

    expect((await post({ skipped: true })).status).toBe(404);
  });

  it("never errors at the student while the table is not there yet", async () => {
    mocks.admin.mockReturnValue(adminWith({ id: "challenge-1" }, { code: "PGRST205" }).client);

    const response = await post({ skipped: true });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ stored: false });
  });

  it("requires a signed-in student", async () => {
    mocks.getVerifiedUser.mockResolvedValue({ data: { user: null } });

    expect((await post({ skipped: true })).status).toBe(401);
  });
});
