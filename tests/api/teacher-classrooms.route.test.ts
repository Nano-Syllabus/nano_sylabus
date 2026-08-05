import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getTeacherProfile: vi.fn(), getTeacherSubjects: vi.fn(), createSupabaseAdminClient: vi.fn() }));
vi.mock("@/app/teachers/actions", () => ({ getTeacherProfile: mocks.getTeacherProfile }));
vi.mock("@/lib/teacher-app/client", () => ({ getTeacherSubjects: mocks.getTeacherSubjects }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));

import { POST } from "@/app/api/teacher/classrooms/route";

describe("POST /api/teacher/classrooms", () => {
  beforeEach(() => {
    mocks.getTeacherProfile.mockResolvedValue({ id: "teacher-1", collection_sk: "collection-secret" });
    mocks.getTeacherSubjects.mockResolvedValue({ subjects: [{ slug: "physics", name: "Physics" }] });
    const chain = { insert: vi.fn(), upsert: vi.fn(async () => ({ error: null })), select: vi.fn(), single: vi.fn(async () => ({ data: { id: "room-1", subject_slug: "physics", subject_name: "Physics", name: "Section A", join_code: "ABC123", created_at: "now", term_key: "2026", meeting_schedule: "", notice: "" }, error: null })) };
    chain.insert.mockReturnValue(chain); chain.select.mockReturnValue(chain);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => chain) });
  });

  it("creates a classroom only for a verified teacher subject", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subjectSlug: "physics", name: "Section A" }) }));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ classroom: expect.objectContaining({ id: "room-1", joinCode: "ABC123", memberCount: 0 }) });
    expect(mocks.getTeacherSubjects).toHaveBeenCalledWith("collection-secret");
  });
});
