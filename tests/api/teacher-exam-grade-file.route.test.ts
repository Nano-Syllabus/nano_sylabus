import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockTeacherApiError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  }
  return {
    getTeacherProfile: vi.fn(),
    gradeTeacherPracticePaperFile: vi.fn(),
    createSupabaseAdminClient: vi.fn(),
    MockTeacherApiError,
  };
});

vi.mock("@/app/teachers/actions", () => ({ getTeacherProfile: mocks.getTeacherProfile }));
vi.mock("@/lib/teacher-app/client", () => ({
  gradeTeacherPracticePaperFile: mocks.gradeTeacherPracticePaperFile,
  TeacherApiError: mocks.MockTeacherApiError,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import { POST } from "@/app/api/teacher/exams/[paperId]/grade-file/route";

function request(type = "application/pdf") {
  const form = new FormData();
  form.append("file", new File(["answer sheet"], "answers.pdf", { type }));
  form.append("student_name", "Jane Doe");
  form.append("instruction", "Be strict");
  return new Request("http://localhost/api/teacher/exams/exam-1/grade-file", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/teacher/exams/[paperId]/grade-file", () => {
  beforeEach(() => {
    mocks.getTeacherProfile.mockResolvedValue({
      id: "teacher-1",
      user_id: "user-1",
      collection_sk: "collection-secret",
    });
    mocks.gradeTeacherPracticePaperFile.mockResolvedValue({
      student_name: "Jane Doe",
      total_score: 8,
      total_marks: 10,
      results: [],
    });
    const readChain = {
      select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn(async () => ({ data: { id: "paper-row-1" }, error: null })),
    };
    readChain.select.mockReturnValue(readChain); readChain.eq.mockReturnValue(readChain); readChain.is.mockReturnValue(readChain);
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => table === "teacher_exam_papers" ? readChain : { insert: vi.fn(async () => ({ error: null })) }),
      storage: { from: vi.fn(() => ({ upload: vi.fn(async () => ({ error: null })), remove: vi.fn(async () => ({ error: null })) })) },
    });
  });

  it("grades against the paper with the signed-in teacher collection key", async () => {
    const response = await POST(request(), { params: Promise.resolve({ paperId: "exam-1" }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.grade.total_score).toBe(8);
    expect(JSON.stringify(payload)).not.toContain("collection-secret");
    expect(mocks.gradeTeacherPracticePaperFile).toHaveBeenCalledWith(
      "collection-secret",
      "exam-1",
      expect.objectContaining({
        studentName: "Jane Doe",
        instruction: "Be strict",
        file: expect.objectContaining({ name: "answers.pdf", mimeType: "application/pdf" }),
      }),
    );
  });

  it("rejects unsupported answer-sheet formats before calling the teacher API", async () => {
    const response = await POST(request("text/plain"), {
      params: Promise.resolve({ paperId: "exam-1" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.gradeTeacherPracticePaperFile).not.toHaveBeenCalled();
  });
});
