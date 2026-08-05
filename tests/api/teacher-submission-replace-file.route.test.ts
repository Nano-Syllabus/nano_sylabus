import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getTeacherProfile: vi.fn(), gradeTeacherPracticePaperFile: vi.fn() }));
vi.mock("@/app/teachers/actions", () => ({ getTeacherProfile: mocks.getTeacherProfile }));
vi.mock("@/lib/teacher-app/client", () => ({ gradeTeacherPracticePaperFile: mocks.gradeTeacherPracticePaperFile, TeacherApiError: class TeacherApiError extends Error {} }));

import { POST } from "@/app/api/teacher/exams/[paperId]/submissions/[submissionId]/replace-file/route";

describe("replace a submission scan", () => {
  beforeEach(() => mocks.getTeacherProfile.mockResolvedValue({ id: "teacher-1", collection_sk: "collection-key" }));

  it("rejects unsupported files before regrading", async () => {
    const form = new FormData();
    form.append("file", new File(["plain text"], "answers.txt", { type: "text/plain" }));
    const response = await POST(new Request("http://localhost", { method: "POST", body: form }), { params: Promise.resolve({ paperId: "paper-1", submissionId: "submission-1" }) });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Use a PDF, JPG, or PNG answer sheet." });
    expect(mocks.gradeTeacherPracticePaperFile).not.toHaveBeenCalled();
  });
});
