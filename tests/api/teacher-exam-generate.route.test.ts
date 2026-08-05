import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockTeacherApiError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  }
  return {
    getTeacherProfile: vi.fn(),
    getTeacherSubjects: vi.fn(),
    generateTeacherCollectionPaper: vi.fn(),
    getTenantApiEnv: vi.fn(),
    createSupabaseAdminClient: vi.fn(),
    MockTeacherApiError,
  };
});

vi.mock("@/app/teachers/actions", () => ({ getTeacherProfile: mocks.getTeacherProfile }));
vi.mock("@/lib/env", () => ({ getTenantApiEnv: mocks.getTenantApiEnv }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/teacher-app/client", () => ({
  getTeacherSubjects: mocks.getTeacherSubjects,
  generateTeacherCollectionPaper: mocks.generateTeacherCollectionPaper,
  TeacherApiError: mocks.MockTeacherApiError,
}));

import { POST } from "@/app/api/teacher/exams/generate/route";

function request(body: unknown) {
  return new Request("http://localhost/api/teacher/exams/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  subjectSlug: "ramesh-teacher-physics",
  title: "Physics unit test",
  instruction: "Mix concepts and calculations.",
  passMarks: 8,
  useSuggestedWeightage: false,
  bands: [
    { label: "Short", questionType: "Short answer", count: 2, marksEach: 5 },
    { label: "Numerical", questionType: "Worked numerical", count: 1, marksEach: 10 },
  ],
};

describe("POST /api/teacher/exams/generate", () => {
  beforeEach(() => {
    mocks.getTeacherProfile.mockResolvedValue({
      id: "teacher-1",
      user_id: "user-1",
      handle: "ramesh",
      collection_sk: "collection-secret",
    });
    mocks.getTeacherSubjects.mockResolvedValue({
      subjects: [{ name: "Physics", slug: "ramesh-teacher-physics", folder_path: "Physics" }],
    });
    mocks.getTenantApiEnv.mockReturnValue({ baseUrl: "https://teacher-api.example.test" });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        upsert: vi.fn(async () => ({ error: null })),
      })),
    });
    mocks.generateTeacherCollectionPaper.mockResolvedValue({
      id: "exam-1",
      title: "Physics unit test",
      subject: "Physics",
      total_marks: 20,
      pass_marks: 8,
      questions: [
        {
          id: "q-1",
          band_label: "Short",
          question_type: "theory",
          marks: 5,
          text: "State Faraday's law.",
          reference_answer: "The induced emf equals the negative rate of change of flux.",
        },
      ],
    });
  });

  it("generates from a verified teacher subject without accepting frontend namespaces", async () => {
    const response = await POST(request(validBody));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.paper.id).toBe("exam-1");
    expect(payload.paper.shareUrl).toBe("https://teacher-api.example.test/exam/paper/exam-1");
    expect(payload.paper.questions[0].referenceAnswer).toContain("rate of change");
    expect(JSON.stringify(payload)).not.toContain("collection-secret");
    expect(mocks.generateTeacherCollectionPaper).toHaveBeenCalledWith(
      "collection-secret",
      expect.objectContaining({
        subject: "Physics",
        title: "Physics unit test",
        pass_marks: 8,
      }),
    );
    const forwarded = mocks.generateTeacherCollectionPaper.mock.calls[0][1];
    expect(forwarded).not.toHaveProperty("namespaces");
    expect(forwarded.bands).toEqual([
      { label: "Short", question_type: "Short answer", count: 2, marks_each: 5 },
      { label: "Numerical", question_type: "Worked numerical", count: 1, marks_each: 10 },
    ]);
    const admin = mocks.createSupabaseAdminClient.mock.results[0].value;
    const table = admin.from.mock.results[0].value;
    expect(table.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        teacher_id: "teacher-1",
        user_id: "user-1",
        external_paper_id: "exam-1",
        subject_slug: "ramesh-teacher-physics",
      }),
      { onConflict: "teacher_id,external_paper_id" },
    );
  });

  it("blocks a subject slug outside this teacher collection", async () => {
    const response = await POST(request({ ...validBody, subjectSlug: "other-private-subject" }));

    expect(response.status).toBe(404);
    expect(mocks.generateTeacherCollectionPaper).not.toHaveBeenCalled();
  });

  it("rejects pass marks above the generated paper total", async () => {
    const response = await POST(request({ ...validBody, passMarks: 25 }));

    expect(response.status).toBe(400);
    expect(mocks.generateTeacherCollectionPaper).not.toHaveBeenCalled();
  });
});
