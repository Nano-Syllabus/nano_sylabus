import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn(), createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));

import { POST } from "@/app/api/student/teacher-classrooms/join/route";

describe("POST /api/student/teacher-classrooms/join", () => {
  beforeEach(() => {
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { getUser: vi.fn(async () => ({ data: { user: { id: "student-1" } } })) } });
    const room = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn(async () => ({ data: { id: "room-1", name: "Section A", subject_name: "Physics" }, error: null })) };
    room.select.mockReturnValue(room); room.eq.mockReturnValue(room); room.is.mockReturnValue(room);
    const members = { upsert: vi.fn(async () => ({ error: null })) };
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn((table: string) => table === "teacher_classrooms" ? room : members) });
  });

  it("joins the authenticated student using a classroom code", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "abc123" }) }));
    expect(response.status).toBe(200);
    const admin = mocks.createSupabaseAdminClient.mock.results[0].value;
    expect(admin.from("teacher_classroom_members").upsert).toHaveBeenCalledWith({ classroom_id: "room-1", student_id: "student-1" }, { onConflict: "classroom_id,student_id" });
  });
});
