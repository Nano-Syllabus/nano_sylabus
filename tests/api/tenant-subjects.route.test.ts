import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  listStudentCourses: vi.fn(),
  listStudentCommunitySubjectAccess: vi.fn(),
  listCreatorPrivateSubjectAccess: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/student-courses", () => ({
  listStudentCourses: mocks.listStudentCourses,
  listStudentCommunitySubjectAccess: mocks.listStudentCommunitySubjectAccess,
  listCreatorPrivateSubjectAccess: mocks.listCreatorPrivateSubjectAccess,
}));

import { GET } from "@/app/api/tenant/subjects/route";

describe("GET /api/tenant/subjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "student-1" } } })) },
    });
    mocks.listStudentCourses.mockResolvedValue([
      {
        id: "9fb2bc93-e80f-4c2a-a298-488253b33a3b",
        subjects: [
          {
            slug: "engineering-physics",
            name: "Engineering Physics",
            folderPath: "Engineering Physics",
          },
          { slug: "mba", name: "MBA", folderPath: "MBA" },
        ],
      },
    ]);
    mocks.listStudentCommunitySubjectAccess.mockResolvedValue([]);
    mocks.listCreatorPrivateSubjectAccess.mockResolvedValue([]);
  });

  it("returns only subjects from the student's enrolled courses", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      subjects: [
        {
          courseId: "9fb2bc93-e80f-4c2a-a298-488253b33a3b",
          name: "Engineering Physics",
          slug: "engineering-physics",
          namespaceSlug: "engineering-physics",
          folderPath: "Engineering Physics",
        },
        {
          courseId: "9fb2bc93-e80f-4c2a-a298-488253b33a3b",
          name: "MBA",
          slug: "mba",
          namespaceSlug: "mba",
          folderPath: "MBA",
        },
      ],
    });
    expect(mocks.listStudentCourses).toHaveBeenCalledWith("student-1");
  });

  it("returns an empty picker when the student has no enrolled courses", async () => {
    mocks.listStudentCourses.mockResolvedValueOnce([]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ subjects: [] });
  });

  it("adds creator-only private subjects to the picker", async () => {
    mocks.listStudentCourses.mockResolvedValueOnce([]);
    mocks.listCreatorPrivateSubjectAccess.mockResolvedValueOnce([
      {
        courseId: "private:profile-1",
        subjectName: "Personal Research",
        subjectSlug: "personal-research",
        folderPath: "Personal Research",
      },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      subjects: [
        {
          courseId: "private:profile-1",
          name: "Personal Research",
          slug: "personal-research",
          namespaceSlug: "personal-research",
          folderPath: "Personal Research",
          private: true,
        },
      ],
    });
  });

  it("rejects unauthenticated subject metadata requests", async () => {
    mocks.createSupabaseServerClient.mockResolvedValueOnce({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.listStudentCourses).not.toHaveBeenCalled();
  });
});
