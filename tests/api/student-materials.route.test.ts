import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getStudentCourseSubjectAccess: vi.fn(),
  getStudentCourseSubjectAccessForCourse: vi.fn(),
  listCreatorPrivateSubjectAccess: vi.fn(),
  listStudentCourses: vi.fn(),
  getTenantSourceTree: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/student-courses", () => ({
  getStudentCourseSubjectAccess: mocks.getStudentCourseSubjectAccess,
  getStudentCourseSubjectAccessForCourse: mocks.getStudentCourseSubjectAccessForCourse,
  listCreatorPrivateSubjectAccess: mocks.listCreatorPrivateSubjectAccess,
  listStudentCourses: mocks.listStudentCourses,
}));
vi.mock("@/lib/tenant/client", () => ({
  getTenantSourceTree: mocks.getTenantSourceTree,
}));

import { GET } from "@/app/api/student/materials/route";

function materialQuery(rows: Record<string, unknown>[]) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    ilike: vi.fn(),
    order: vi.fn(async () => ({ data: rows, error: null })),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.ilike.mockReturnValue(chain);
  return chain;
}

describe("GET /api/student/materials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "student-1" } } })) },
    });
    mocks.getStudentCourseSubjectAccess.mockResolvedValue({
      courseId: "course-1",
      teacherId: "teacher-1",
      subjectSlug: "control-systems",
      subjectName: "Control Systems",
      folderPath: "teacher-1/Control Systems",
    });
    mocks.getTenantSourceTree.mockResolvedValue({ tree: [] });
    mocks.listCreatorPrivateSubjectAccess.mockResolvedValue([]);
    mocks.listStudentCourses.mockResolvedValue([]);
  });

  it("returns private mirrored files without waiting for the tenant tree", async () => {
    const query = materialQuery([
      {
        id: "mirror-1",
        external_document_id: "document-1",
        collection_path: "teacher-1/Control Systems/Notes/fundamentals.pdf",
        storage_path: "teacher-1/fundamentals.pdf",
        original_name: "fundamentals.pdf",
        mime_type: "application/pdf",
        size_bytes: 2048,
      },
      {
        id: "wrong-prefix",
        external_document_id: "document-2",
        collection_path: "teacher-1/Control Systems Lab/Notes/lab.pdf",
        storage_path: "teacher-1/lab.pdf",
        original_name: "lab.pdf",
        mime_type: "application/pdf",
        size_bytes: 1024,
      },
    ]);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => query) });

    const response = await GET(
      new Request("http://localhost/api/student/materials?subject=control-systems"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.materials).toEqual([
      expect.objectContaining({
        name: "fundamentals.pdf",
        shelf: "Notes",
        documentId: "mirror-1",
        mimeType: "application/pdf",
        previewAvailable: true,
      }),
    ]);
    expect(mocks.getTenantSourceTree).not.toHaveBeenCalled();
  });

  it("requires enrollment in the requested subject", async () => {
    mocks.getStudentCourseSubjectAccess.mockResolvedValueOnce(null);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn() });

    const response = await GET(
      new Request("http://localhost/api/student/materials?subject=control-systems"),
    );

    expect(response.status).toBe(403);
    expect(mocks.getTenantSourceTree).not.toHaveBeenCalled();
  });

  it("includes creator-only subjects in the complete library", async () => {
    mocks.listCreatorPrivateSubjectAccess.mockResolvedValueOnce([
      {
        courseId: "private:profile-1",
        teacherId: "teacher-1",
        subjectSlug: "my-research",
        subjectName: "My Research",
        folderPath: "My Research",
        accessKind: "owner-private",
      },
    ]);
    const query = materialQuery([]);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => query) });

    const response = await GET(new Request("http://localhost/api/student/materials"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.subjects).toEqual([
      expect.objectContaining({
        courseId: "private:profile-1",
        courseName: "Private",
        private: true,
        subject: { name: "My Research", slug: "my-research" },
      }),
    ]);
  });
});
