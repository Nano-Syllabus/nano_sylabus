import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  remove: vi.fn(),
  send: vi.fn(),
  upload: vi.fn(),
  savePreview: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        remove: mocks.remove,
        download: async () => ({ data: new Blob(["%PDF-test"]), error: null }),
      }),
    },
  }),
}));
vi.mock("@/lib/data/challenge-collection-key", () => ({
  collectionKeyForTeacher: async () => "key",
}));
vi.mock("@/lib/env", () => ({
  getTenantApiEnv: () => ({ baseUrl: "http://localhost:8000", rejectUnauthorized: true }),
}));
vi.mock("@/lib/teacher-app/client", () => ({
  getTeacherPracticeTopics: async () => ({ topics: [] }),
  indexTeacherDocument: vi.fn(),
}));
vi.mock("@/lib/teacher-document-import", () => ({
  safeFilename: (s: string) => s,
  sendTenantRequest: mocks.send,
  uploadAndIndex: mocks.upload,
  savePreview: mocks.savePreview,
  indexedDocumentId: () => "",
  jobId: () => "",
}));
import { processContribution } from "@/lib/data/material-contributions";
import type { StudentCourseSubjectAccess } from "@/lib/student-courses";
const access = {
  teacherId: "teacher",
  subjectSlug: "math",
  subjectName: "Mathematics",
} as StudentCourseSubjectAccess;
const input = { storagePath: "teacher/contributions/student/saved.pdf", fileName: "saved.pdf" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.remove.mockResolvedValue({ error: null });
});

it("keeps saved bytes when Gemini is unreachable", async () => {
  mocks.send.mockRejectedValue(Object.assign(new Error("Provider unavailable"), { status: 503 }));
  await expect(processContribution("student", access, input)).rejects.toMatchObject({
    status: 502,
  });
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
});

it("keeps saved bytes when triage reports an operational error", async () => {
  mocks.send.mockResolvedValue({ status: "error", reason: "Gemini rate limited" });
  await expect(processContribution("student", access, input)).rejects.toMatchObject({
    status: 502,
  });
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("still rejects unrelated material rather than bypassing the subject check", async () => {
  mocks.send.mockResolvedValue({ status: "rejected", reason: "Unrelated subject" });
  await expect(processContribution("student", access, input)).resolves.toMatchObject({
    status: "rejected",
  });
  expect(mocks.remove).toHaveBeenCalledWith([input.storagePath]);
  expect(mocks.upload).not.toHaveBeenCalled();
});
