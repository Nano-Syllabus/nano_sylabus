import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTeacherProfile: vi.fn(),
  getTeacherSubjects: vi.fn(),
  createTeacherFolder: vi.fn(),
}));

vi.mock("@/app/teachers/actions", () => ({ getTeacherProfile: mocks.getTeacherProfile }));
vi.mock("@/lib/teacher-app/client", () => ({
  createTeacherFolder: mocks.createTeacherFolder,
  getTeacherSubjects: mocks.getTeacherSubjects,
  TeacherApiError: class TeacherApiError extends Error {},
}));

import { POST } from "@/app/api/teacher/folders/route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/teacher/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/teacher/folders", () => {
  beforeEach(() => {
    mocks.getTeacherProfile.mockResolvedValue({ collection_sk: "collection-secret" });
    mocks.getTeacherSubjects.mockResolvedValue({
      subjects: [{ slug: "physics", name: "Physics", folder_path: "Physics" }],
    });
    mocks.createTeacherFolder.mockResolvedValue({ path: "Physics/Notes/Chapter 1" });
  });

  it("creates a chapter folder inside a verified subject shelf", async () => {
    const response = await POST(request({ subjectSlug: "physics", shelf: "Notes", name: "Chapter 1" }));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.path).toBe("Physics/Notes/Chapter 1");
    expect(mocks.createTeacherFolder).toHaveBeenCalledWith("collection-secret", "Physics/Notes/Chapter 1");
  });

  it("rejects slashes before calling the collection API", async () => {
    const response = await POST(request({ subjectSlug: "physics", shelf: "Notes", name: "Chapter/One" }));

    expect(response.status).toBe(400);
    expect(mocks.createTeacherFolder).not.toHaveBeenCalled();
  });
});
