import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  gradeTeacherPracticePaper: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));
vi.mock("@/lib/teacher-app/client", () => ({
  gradeTeacherPracticePaper: mocks.gradeTeacherPracticePaper,
  TeacherApiError: class TeacherApiError extends Error {},
}));

import { POST } from "@/app/api/student/teacher-exams/[assignmentId]/grade/route";

function query(result: unknown) {
  const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), order: vi.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue(result);
  chain.order.mockResolvedValue(result);
  return chain;
}

describe("student teacher-exam attempts", () => {
  beforeEach(() => {
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { getUser: vi.fn(async () => ({ data: { user: { id: "student-1", email: "student@example.com" } } })) } });
    const assignment = query({ data: { id: "assignment-1", teacher_id: "teacher-1", paper_id: "paper-1", classroom_id: "classroom-1", opens_at: null, closes_at: null, max_attempts: 1 }, error: null });
    const membership = query({ data: { classroom_id: "classroom-1" }, error: null });
    const attempts = query({ data: [{ attempt_no: 1 }], error: null });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => table === "teacher_exam_assignments" ? assignment : table === "teacher_classroom_members" ? membership : attempts),
    });
  });

  it("stops a student after the assignment attempt limit", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: [{ questionId: "q1", answerText: "Answer" }] }) }), { params: Promise.resolve({ assignmentId: "assignment-1" }) });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "You have used all 1 allowed attempts." });
    expect(mocks.gradeTeacherPracticePaper).not.toHaveBeenCalled();
  });
});
