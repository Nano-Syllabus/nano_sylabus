import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockTeacherApiError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  }
  return {
    createSupabaseServerClient: vi.fn(),
    createSupabaseAdminClient: vi.fn(),
    getStudentCourseSubjectAccess: vi.fn(),
    getStudentCourseSubjectAccessForDocumentPath: vi.fn(),
    getTeacherDocument: vi.fn(),
    getTeacherDocuments: vi.fn(),
    getTenantSourceTree: vi.fn(),
    listTenantSubjects: vi.fn(),
    MockTeacherApiError,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/student-courses", () => ({
  getStudentCourseSubjectAccess: mocks.getStudentCourseSubjectAccess,
  getStudentCourseSubjectAccessForDocumentPath:
    mocks.getStudentCourseSubjectAccessForDocumentPath,
}));
vi.mock("@/lib/teacher-app/client", () => ({
  getTeacherDocument: mocks.getTeacherDocument,
  getTeacherDocuments: mocks.getTeacherDocuments,
  TeacherApiError: mocks.MockTeacherApiError,
}));
vi.mock("@/lib/tenant/client", () => ({
  getTenantSourceTree: mocks.getTenantSourceTree,
  listTenantSubjects: mocks.listTenantSubjects,
}));

import { GET } from "@/app/api/student/materials/[documentId]/route";

const context = { params: Promise.resolve({ documentId: "document-1" }) };

function query(result: Record<string, unknown> | null) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    update: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: result, error: null })),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  return chain;
}

describe("GET /api/student/materials/[documentId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "student-1" } } })) },
    });
    mocks.getTenantSourceTree.mockResolvedValue({
      tree: [
        {
          name: "teacher-a",
          children: [
            {
              name: "Physics",
              children: [
                {
                  name: "notes.pdf",
                  type: "file",
                  document_id: "document-1",
                  path: "teacher-a/Physics/Notes/notes.pdf",
                },
              ],
            },
          ],
        },
      ],
    });
    mocks.listTenantSubjects.mockResolvedValue([
      {
        name: "Physics",
        slug: "physics",
        folder_path: "teacher-a/Physics",
        namespace: "teacher-a",
      },
    ]);
    mocks.getStudentCourseSubjectAccess.mockResolvedValue({
      courseId: "course-1",
      teacherId: "teacher-1",
      subjectSlug: "physics",
      subjectName: "Physics",
      folderPath: "Physics",
    });
    mocks.getStudentCourseSubjectAccessForDocumentPath.mockResolvedValue({
      courseId: "course-1",
      teacherId: "teacher-1",
      subjectSlug: "physics",
      subjectName: "Physics",
      folderPath: "Physics",
    });
    mocks.getTeacherDocument.mockResolvedValue({
      id: "document-1",
      status: "indexed",
      word_count: 1200,
      chunk_count: 18,
    });

    const teacherQuery = query({ collection_sk: "collection-secret" });
    const mirrorQuery = query({
      id: "mirror-1",
      teacher_id: "teacher-1",
      external_document_id: "document-1",
      collection_path: "Physics/Notes/notes.pdf",
      storage_path: "teacher-1/notes.pdf",
      original_name: "notes.pdf",
      mime_type: "application/pdf",
    });
    const download = vi.fn(async () => ({
      data: new Blob(["pdf"], { type: "application/pdf" }),
      error: null,
    }));
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => (table === "teachers" ? teacherQuery : mirrorQuery)),
      storage: { from: vi.fn(() => ({ download })) },
    });
  });

  it("loads real metadata through the owning teacher collection", async () => {
    const response = await GET(
      new Request("http://localhost/api/student/materials/document-1?metadata=1"),
      context,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.document).toMatchObject({ word_count: 1200, chunk_count: 18 });
    expect(mocks.getTeacherDocument).toHaveBeenCalledWith("collection-secret", "document-1");
    expect(JSON.stringify(payload)).not.toContain("collection-secret");
  });

  it("streams the private mirrored original after course access is verified", async () => {
    const response = await GET(
      new Request("http://localhost/api/student/materials/document-1"),
      context,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("notes.pdf");
    await expect(response.text()).resolves.toBe("pdf");
  });

  it("rejects a student who is not enrolled in the subject's course", async () => {
    mocks.getStudentCourseSubjectAccessForDocumentPath.mockResolvedValueOnce(null);
    const response = await GET(
      new Request("http://localhost/api/student/materials/document-1?metadata=1"),
      context,
    );

    expect(response.status).toBe(403);
    expect(mocks.getTeacherDocument).not.toHaveBeenCalled();
  });
});
