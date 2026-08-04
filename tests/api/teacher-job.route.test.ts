import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockTeacherApiError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  }
  return { getTeacherProfile: vi.fn(), getTeacherJob: vi.fn(), MockTeacherApiError };
});

vi.mock("@/app/teachers/actions", () => ({ getTeacherProfile: mocks.getTeacherProfile }));
vi.mock("@/lib/teacher-app/client", () => ({
  getTeacherJob: mocks.getTeacherJob,
  TeacherApiError: mocks.MockTeacherApiError,
}));

import { GET } from "@/app/api/teacher/jobs/[jobId]/route";

describe("GET /api/teacher/jobs/[jobId]", () => {
  beforeEach(() => {
    mocks.getTeacherProfile.mockResolvedValue({
      id: "teacher-1",
      user_id: "user-1",
      handle: "ramesh",
      collection_sk: "collection-secret",
    });
    mocks.getTeacherJob.mockResolvedValue({ id: "job-1", status: "completed" });
  });

  it("checks the teacher's indexing job without exposing their key", async () => {
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ jobId: "job-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.job.status).toBe("completed");
    expect(JSON.stringify(payload)).not.toContain("collection-secret");
    expect(mocks.getTeacherJob).toHaveBeenCalledWith("collection-secret", "job-1");
  });

  it("returns not found for a job outside the collection", async () => {
    mocks.getTeacherJob.mockRejectedValue(new mocks.MockTeacherApiError("Not found", 404));

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ jobId: "other-job" }),
    });

    expect(response.status).toBe(404);
  });
});
