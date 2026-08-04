import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTeacherProfile: vi.fn(),
  gradeTeacherPracticePaper: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  TeacherApiError: class extends Error { constructor(message: string, readonly status: number) { super(message); } },
}));

vi.mock("@/app/teachers/actions", () => ({ getTeacherProfile: mocks.getTeacherProfile }));
vi.mock("@/lib/teacher-app/client", () => ({ gradeTeacherPracticePaper: mocks.gradeTeacherPracticePaper, TeacherApiError: mocks.TeacherApiError }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));

import { POST } from "@/app/api/teacher/exams/[paperId]/grade/route";

describe("POST /api/teacher/exams/[paperId]/grade", () => {
  beforeEach(() => {
    mocks.getTeacherProfile.mockResolvedValue({ id: "teacher-1", collection_sk: "collection-secret" });
    mocks.gradeTeacherPracticePaper.mockResolvedValue({ submission_id: "sub-1", total_score: 4, total_marks: 5, results: [] });
    const paper = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn(async () => ({ data: { id: "paper-row" }, error: null })) };
    paper.select.mockReturnValue(paper); paper.eq.mockReturnValue(paper); paper.is.mockReturnValue(paper);
    const submission = { insert: vi.fn(async () => ({ error: null })) };
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn((table: string) => table === "teacher_exam_papers" ? paper : submission) });
  });

  it("grades typed answers and persists the submission", async () => {
    const request = new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentName: "Jane", answers: [{ questionId: "q-1", answerText: "Answer" }] }) });
    const response = await POST(request, { params: Promise.resolve({ paperId: "exam-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.gradeTeacherPracticePaper).toHaveBeenCalledWith("collection-secret", "exam-1", expect.objectContaining({ answers: [{ question_id: "q-1", answer_text: "Answer" }] }));
    const admin = mocks.createSupabaseAdminClient.mock.results[0].value;
    expect(admin.from("teacher_exam_submissions").insert).toHaveBeenCalledWith(expect.objectContaining({ source: "typed", external_submission_id: "sub-1" }));
  });
});
