import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTeacherProfile: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/app/teachers/actions", () => ({ getTeacherProfile: mocks.getTeacherProfile }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import { GET } from "@/app/api/teacher/exams/route";

describe("GET /api/teacher/exams", () => {
  beforeEach(() => {
    mocks.getTeacherProfile.mockResolvedValue({
      id: "teacher-1",
      user_id: "user-1",
      handle: "ramesh",
      collection_sk: "collection-secret",
    });

    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(async () => ({
        data: [
          {
            paper: {
              id: "exam-1",
              subjectSlug: "ramesh-teacher-physics",
              title: "Physics test",
              questions: [],
            },
            created_at: "2026-08-05T00:00:00.000Z",
          },
        ],
        error: null,
      })),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => chain) });
  });

  it("returns only the authenticated teacher's persisted papers", async () => {
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.papers).toEqual([
      expect.objectContaining({
        id: "exam-1",
        subjectSlug: "ramesh-teacher-physics",
        createdAt: "2026-08-05T00:00:00.000Z",
      }),
    ]);
    expect(JSON.stringify(payload)).not.toContain("collection-secret");
    const admin = mocks.createSupabaseAdminClient.mock.results[0].value;
    const table = admin.from.mock.results[0].value;
    expect(table.eq).toHaveBeenCalledWith("teacher_id", "teacher-1");
  });

  it("rejects a non-teacher before reading paper history", async () => {
    mocks.getTeacherProfile.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });
});
