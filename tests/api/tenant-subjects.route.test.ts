import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  listStudentCourses: vi.fn(),
  listTenantSubjects: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/student-courses", () => ({
  listStudentCourses: mocks.listStudentCourses,
}));
vi.mock("@/lib/tenant/client", () => ({
  listTenantSubjects: mocks.listTenantSubjects,
}));

import { GET } from "@/app/api/tenant/subjects/route";

describe("GET /api/tenant/subjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "student-1" } } })) },
    });
    mocks.listTenantSubjects.mockResolvedValue([
      {
        name: "Digital Logic",
        slug: "digital-logic",
        namespace_slug: "digital-logic",
        folder_path: "Digital Logic",
      },
      {
        name: "Engineering Physics",
        slug: "engineering-physics",
        namespace_slug: "engineering-physics",
        folder_path: "Engineering Physics",
      },
      { name: "MBA", slug: "mba", namespace_slug: "mba", folder_path: "MBA" },
    ]);
    mocks.listStudentCourses.mockResolvedValue([
      {
        id: "course-1",
        subjects: [
          { slug: "engineering-physics", name: "Engineering Physics", folderPath: "Engineering Physics" },
          { slug: "mba", name: "MBA", folderPath: "MBA" },
        ],
      },
    ]);
  });

  it("returns only subjects from the student's enrolled courses", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      subjects: [
        {
          name: "Engineering Physics",
          slug: "engineering-physics",
          namespaceSlug: "engineering-physics",
          folderPath: "Engineering Physics",
        },
        { name: "MBA", slug: "mba", namespaceSlug: "mba", folderPath: "MBA" },
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

  it("rejects unauthenticated subject metadata requests", async () => {
    mocks.createSupabaseServerClient.mockResolvedValueOnce({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.listStudentCourses).not.toHaveBeenCalled();
    expect(mocks.listTenantSubjects).not.toHaveBeenCalled();
  });
});
