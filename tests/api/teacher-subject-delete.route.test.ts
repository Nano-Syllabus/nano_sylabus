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
    deleteTeacherSubject: vi.fn(),
    deleteTeacherPath: vi.fn(),
    MockTeacherApiError,
  };
});

vi.mock("@/app/teachers/actions", () => ({ getTeacherProfile: mocks.getTeacherProfile }));
vi.mock("@/lib/teacher-app/client", () => ({
  getTeacherSubjects: mocks.getTeacherSubjects,
  deleteTeacherSubject: mocks.deleteTeacherSubject,
  deleteTeacherPath: mocks.deleteTeacherPath,
  TeacherApiError: mocks.MockTeacherApiError,
}));

import { DELETE } from "@/app/api/teacher/subjects/[slug]/route";

const context = (slug = "ramesh-teacher-physics") => ({ params: Promise.resolve({ slug }) });

describe("DELETE /api/teacher/subjects/[slug]", () => {
  beforeEach(() => {
    mocks.getTeacherProfile.mockResolvedValue({
      id: "teacher-1",
      user_id: "user-1",
      handle: "ramesh",
      collection_sk: "collection-secret",
    });
    mocks.getTeacherSubjects.mockResolvedValue({
      subjects: [
        { name: "Physics", slug: "ramesh-teacher-physics", folder_path: "Physics" },
      ],
    });
    mocks.deleteTeacherSubject.mockResolvedValue({ deleted: true });
    mocks.deleteTeacherPath.mockResolvedValue({ deleted: true });
  });

  it("can unpin a subject while keeping its files", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/teacher/subjects/ramesh-teacher-physics", {
        method: "DELETE",
      }),
      context(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true, filesDeleted: false });
    expect(mocks.deleteTeacherPath).not.toHaveBeenCalled();
    expect(mocks.deleteTeacherSubject).toHaveBeenCalledWith(
      "collection-secret",
      "ramesh-teacher-physics",
    );
  });

  it("deletes the verified source folder before unpinning when explicitly requested", async () => {
    const response = await DELETE(
      new Request(
        "http://localhost/api/teacher/subjects/ramesh-teacher-physics?deleteFiles=1",
        { method: "DELETE" },
      ),
      context(),
    );

    expect(response.status).toBe(200);
    expect(mocks.deleteTeacherPath).toHaveBeenCalledWith("collection-secret", "Physics");
    expect(mocks.deleteTeacherPath.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteTeacherSubject.mock.invocationCallOrder[0],
    );
  });

  it("blocks a slug that is not pinned inside this teacher collection", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/teacher/subjects/private", { method: "DELETE" }),
      context("private"),
    );

    expect(response.status).toBe(404);
    expect(mocks.deleteTeacherSubject).not.toHaveBeenCalled();
    expect(mocks.deleteTeacherPath).not.toHaveBeenCalled();
  });

  it("refuses to delete an unsafe folder path returned by the backend", async () => {
    mocks.getTeacherSubjects.mockResolvedValue({
      subjects: [
        { name: "Physics", slug: "ramesh-teacher-physics", folder_path: "../Physics" },
      ],
    });

    const response = await DELETE(
      new Request(
        "http://localhost/api/teacher/subjects/ramesh-teacher-physics?deleteFiles=1",
        { method: "DELETE" },
      ),
      context(),
    );

    expect(response.status).toBe(400);
    expect(mocks.deleteTeacherPath).not.toHaveBeenCalled();
    expect(mocks.deleteTeacherSubject).not.toHaveBeenCalled();
  });
});
