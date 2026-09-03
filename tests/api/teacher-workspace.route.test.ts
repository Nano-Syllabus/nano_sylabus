import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockTeacherApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly payload?: unknown,
    ) {
      super(message);
    }
  }

  return {
    createSupabaseServerClient: vi.fn(),
    getTeacherProfile: vi.fn(),
    getTeacherMe: vi.fn(),
    getTeacherSubjects: vi.fn(),
    getTeacherSourceTree: vi.fn(),
    getTeacherDocuments: vi.fn(),
    createSupabaseAdminClient: vi.fn(),
    MockTeacherApiError,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

vi.mock("@/app/teachers/actions", () => ({
  getTeacherProfile: mocks.getTeacherProfile,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/teacher-app/client", () => ({
  getTeacherMe: mocks.getTeacherMe,
  getTeacherSubjects: mocks.getTeacherSubjects,
  getTeacherSourceTree: mocks.getTeacherSourceTree,
  getTeacherDocuments: mocks.getTeacherDocuments,
  TeacherApiError: mocks.MockTeacherApiError,
}));

import { GET } from "@/app/api/teacher/workspace/route";

describe("GET /api/teacher/workspace", () => {
  beforeEach(() => {
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1", email: "teacher@example.com", user_metadata: {} } },
        })),
      },
    });
    mocks.getTeacherProfile.mockResolvedValue({
      id: "teacher-1",
      user_id: "user-1",
      handle: "ramesh",
      collection_sk: "collection-secret",
    });
    mocks.getTeacherMe.mockResolvedValue({ collection: "ramesh-teacher", indexed_files: 2 });
    mocks.getTeacherSubjects.mockResolvedValue({
      subjects: [{ name: "Physics", slug: "physics", folder_path: "Physics" }],
    });
    mocks.getTeacherSourceTree.mockResolvedValue({ name: "ramesh-teacher", children: [] });
    mocks.getTeacherDocuments.mockResolvedValue([
      { document_id: "doc-1", name: "notes.pdf", path: "Physics/Notes/notes.pdf" },
    ]);
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => chain) });
  });

  it("returns the real workspace without exposing the collection key", async () => {
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.teacher).toEqual({
      handle: "ramesh",
      email: "teacher@example.com",
      fullName: "ramesh",
      language: "EN",
      answerStyle: "exam_focused",
      publicProfile: {
        displayName: "ramesh",
        headline: "",
        bio: "",
        institution: "",
        location: "",
        expertise: [],
        yearsExperience: 0,
        website: "",
        avatarPath: "",
        avatarUrl: "",
        complete: false,
      },
    });
    expect(payload.subjects.subjects[0].name).toBe("Physics");
    expect(JSON.stringify(payload)).not.toContain("collection-secret");
    expect(mocks.getTeacherMe).toHaveBeenCalledWith("collection-secret");
    expect(mocks.getTeacherDocuments).toHaveBeenCalledWith("collection-secret");
  });

  it("rejects an unauthenticated request before reading the teacher profile", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    });

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.getTeacherProfile).not.toHaveBeenCalled();
  });

  it("returns active community access alongside existing private library profiles", async () => {
    const admin = mocks.createSupabaseAdminClient();
    const fallback = admin.from.getMockImplementation();
    const profiles = queryResult([
      { subject_slug: "physics", subject_name: "Physics", visibility: "private" },
    ]);
    const links = queryResult([
      {
        external_subject_slug: "physics",
        status: "active",
        communities: { slug: "engineering", name: "Engineering", status: "active" },
      },
    ]);
    admin.from.mockImplementation((table: string) =>
      table === "community_subjects"
        ? links
        : table === "teacher_subject_profiles"
          ? profiles
          : fallback(table),
    );

    const response = await GET();
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.subjectProfiles[0]).toMatchObject({
      subject_slug: "physics",
      visibility: "private",
      communities: [{ slug: "engineering", name: "Engineering" }],
    });
    expect(links.eq).toHaveBeenCalledWith("teacher_id", "teacher-1");
    expect(links.eq).toHaveBeenCalledWith("status", "active");
    expect(links.eq).toHaveBeenCalledWith("communities.status", "active");
    expect(JSON.stringify(payload)).not.toContain("collection-secret");
  });

  it("returns a recoverable error instead of incorrect access labels when linkage lookup fails", async () => {
    const admin = mocks.createSupabaseAdminClient();
    const fallback = admin.from.getMockImplementation();
    const links = queryResult([], { message: "Database unavailable" });
    admin.from.mockImplementation((table: string) =>
      table === "community_subjects" ? links : fallback(table),
    );
    const response = await GET();
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Could not load subject community access. Please try again.",
    });
  });

  it("turns an invalid collection key into a recoverable workspace error", async () => {
    mocks.getTeacherMe.mockRejectedValue(new mocks.MockTeacherApiError("Unauthorized", 401));

    const response = await GET();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "This teacher workspace key is no longer valid. Ask an administrator to rotate it.",
    });
  });
});

function queryResult(data: Record<string, unknown>[], error: { message: string } | null = null) {
  const query = { data, error, select: vi.fn(), eq: vi.fn() };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}
