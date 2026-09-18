import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getVerifiedUser: vi.fn(),
  gradeContext: vi.fn(),
  refresh: vi.fn(),
  submitFile: vi.fn(),
  expired: vi.fn(),
  persist: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/supabase/verified-user", () => ({ getVerifiedUser: mocks.getVerifiedUser }));
vi.mock("@/lib/data/student-challenges", () => ({
  getStudentChallengeGradeContext: mocks.gradeContext,
  refreshStudentChallengeExam: mocks.refresh,
  submitStudentChallengeFile: mocks.submitFile,
  challengeExamExpired: mocks.expired,
}));
vi.mock("@/lib/data/student-challenge-grading", () => ({
  persistStudentChallengeGrade: mocks.persist,
}));

import { POST } from "@/app/api/student/challenges/[challengeId]/submit-file/route";

function submit() {
  const form = new FormData();
  form.set(
    "file",
    new File([new Uint8Array([37, 80, 68, 70])], "statistics_answers.pdf", {
      type: "application/pdf",
    }),
  );
  return POST(
    new Request("http://localhost/api/student/challenges/challenge-1/submit-file", {
      method: "POST",
      body: form,
    }),
    { params: Promise.resolve({ challengeId: "challenge-1" }) },
  );
}

function context(examProvider: string | undefined) {
  return {
    externalPaperId: "attempt-1",
    detail: {
      id: "challenge-1",
      status: "started",
      lessonRead: true,
      examplesReviewed: true,
      content: { provider: "collection-challenge-v1", examProvider, examQuestions: [] },
    },
  };
}

describe("POST /api/student/challenges/[challengeId]/submit-file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseServerClient.mockResolvedValue({});
    mocks.getVerifiedUser.mockResolvedValue({
      data: { user: { id: "student-1", user_metadata: { full_name: "Asha" } } },
    });
    mocks.expired.mockReturnValue(false);
    mocks.refresh.mockResolvedValue({ id: "challenge-1" });
    mocks.submitFile.mockResolvedValue({
      results: [],
      evaluation: null,
      total_score: 14,
      total_marks: 20,
      passed: true,
    });
    mocks.persist.mockResolvedValue({ id: "challenge-1", status: "completed" });
  });

  it("grades a current challenge exam instead of replacing it", async () => {
    // Every challenge issued today is `challenge-exam-v1`. The route accepted only
    // the legacy practice paper, so each Submit was answered with "Your
    // answer-sheet grader was upgraded" and a brand-new exam — forever.
    mocks.gradeContext.mockResolvedValue(context("challenge-exam-v1"));

    const response = await submit();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.submitFile).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "student-1", challengeId: "challenge-1" }),
    );
    expect(payload).toMatchObject({ totalScore: 14, totalMarks: 20, passed: true });
  });

  it("still grades a legacy practice-paper sitting", async () => {
    mocks.gradeContext.mockResolvedValue(context("practice-paper-v1"));

    const response = await submit();

    expect(response.status).toBe(200);
    expect(mocks.submitFile).toHaveBeenCalledTimes(1);
  });

  it("reissues an exam this route cannot grade from a scan", async () => {
    mocks.gradeContext.mockResolvedValue(context(undefined));

    const response = await submit();

    expect(response.status).toBe(409);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.submitFile).not.toHaveBeenCalled();
  });
});
