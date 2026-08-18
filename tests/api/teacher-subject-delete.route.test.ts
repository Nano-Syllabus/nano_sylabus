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
    createSupabaseAdminClient: vi.fn(),
    MockTeacherApiError,
  };
});

vi.mock("@/app/teachers/actions", () => ({ getTeacherProfile: mocks.getTeacherProfile }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/teacher-app/client", () => ({
  getTeacherSubjects: mocks.getTeacherSubjects,
  deleteTeacherSubject: mocks.deleteTeacherSubject,
  deleteTeacherPath: mocks.deleteTeacherPath,
  TeacherApiError: mocks.MockTeacherApiError,
}));

import { DELETE } from "@/app/api/teacher/subjects/[slug]/route";

const context = (slug = "ramesh-teacher-physics") => ({ params: Promise.resolve({ slug }) });
let testQueries: Record<
  string,
  {
    delete: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
  }
>;

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
    const createQuery = (data: unknown[] = []) => {
      const query = {
        delete: vi.fn(),
        eq: vi.fn(),
      in: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve(resolve({ data, error: null })),
      };
      query.delete.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      query.in.mockReturnValue(query);
      query.select.mockReturnValue(query);
      return query;
    };
    const queries = {
      teacher_course_subjects: createQuery([{ course_id: "course-1" }]),
      teacher_subject_profiles: createQuery(),
      teacher_subject_syllabi: createQuery(),
      teacher_document_files: createQuery(),
    };
    testQueries = queries;
    const admin = {
      from: vi.fn((table: string) => queries[table as keyof typeof queries] || createQuery()),
      storage: {
        from: vi.fn(() => ({
          remove: vi.fn(async () => ({ data: [], error: null })),
        })),
      },
    };
    /* Keep the service-role mock table-aware: deletion now clears both the
       subject profile (which drives the workspace card) and local mirrors. */
    mocks.createSupabaseAdminClient.mockReturnValue(admin);
  });

  it("can unpin a subject while keeping its files", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/teacher/subjects/ramesh-teacher-physics", {
        method: "DELETE",
      }),
      context(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deleted: true,
      filesDeleted: false,
      coursesUpdated: 1,
      localFilesDeleted: 0,
    });
    expect(mocks.deleteTeacherPath).not.toHaveBeenCalled();
    expect(mocks.deleteTeacherSubject).toHaveBeenCalledWith(
      "collection-secret",
      "ramesh-teacher-physics",
      { deleteFolder: false },
    );
  });

  it("detaches only the deleted subject while keeping its multi-subject course", async () => {
    mocks.getTeacherSubjects.mockResolvedValue({
      subjects: [
        { name: "Physics", slug: "ramesh-teacher-physics", folder_path: "Physics" },
        { name: "Chemistry", slug: "ramesh-teacher-chemistry", folder_path: "Chemistry" },
      ],
    });

    const response = await DELETE(
      new Request("http://localhost/api/teacher/subjects/ramesh-teacher-physics", {
        method: "DELETE",
      }),
      context(),
    );

    expect(response.status).toBe(200);
    const admin = mocks.createSupabaseAdminClient.mock.results[0].value;
    expect(admin.from).toHaveBeenCalledWith("teacher_course_subjects");
    const query = testQueries.teacher_course_subjects;
    expect(query.eq).toHaveBeenCalledWith("teacher_id", "teacher-1");
    expect(query.eq).toHaveBeenCalledWith("subject_slug", "ramesh-teacher-physics");
    expect(admin.from).not.toHaveBeenCalledWith("teacher_courses");
  });

  it("asks the operator to delete the verified source folder atomically", async () => {
    const response = await DELETE(
      new Request(
        "http://localhost/api/teacher/subjects/ramesh-teacher-physics?deleteFiles=1",
        { method: "DELETE" },
      ),
      context(),
    );

    expect(response.status).toBe(200);
    expect(mocks.deleteTeacherPath).not.toHaveBeenCalled();
    expect(mocks.deleteTeacherSubject).toHaveBeenCalledWith(
      "collection-secret",
      "ramesh-teacher-physics",
      { deleteFolder: true },
    );
  });

  it("removes a stale local profile when the remote subject is already gone", async () => {
    mocks.getTeacherSubjects.mockResolvedValue({ subjects: [] });
    testQueries.teacher_subject_profiles.maybeSingle.mockResolvedValue({
      data: { subject_slug: "ramesh-teacher-physics", folder_path: "Physics" },
      error: null,
    });

    const response = await DELETE(
      new Request(
        "http://localhost/api/teacher/subjects/ramesh-teacher-physics?deleteFiles=1",
        { method: "DELETE" },
      ),
      context(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deleted: true,
      filesDeleted: true,
      coursesUpdated: 1,
      localFilesDeleted: 0,
    });
    expect(mocks.deleteTeacherSubject).not.toHaveBeenCalled();
    expect(testQueries.teacher_subject_profiles.delete).toHaveBeenCalled();
    expect(testQueries.teacher_subject_syllabi.delete).toHaveBeenCalled();
  });

  it("blocks a slug that is not pinned inside this teacher collection", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/teacher/subjects/private", { method: "DELETE" }),
      context("private"),
    );

    expect(response.status).toBe(404);
    expect(mocks.deleteTeacherSubject).not.toHaveBeenCalled();
    expect(mocks.deleteTeacherPath).not.toHaveBeenCalled();
    expect(mocks.createSupabaseAdminClient).toHaveBeenCalled();
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
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });
});
