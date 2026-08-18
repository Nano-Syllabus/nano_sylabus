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
    getTeacherProfile: vi.fn(),
    createTeacherSubject: vi.fn(),
    createSupabaseAdminClient: vi.fn(),
    MockTeacherApiError,
  };
});

vi.mock("@/app/teachers/actions", () => ({
  getTeacherProfile: mocks.getTeacherProfile,
}));

vi.mock("@/lib/teacher-app/client", () => ({
  createTeacherSubject: mocks.createTeacherSubject,
  TeacherApiError: mocks.MockTeacherApiError,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import { POST } from "@/app/api/teacher/subjects/route";

function request(body: unknown) {
  return new Request("http://localhost/api/teacher/subjects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/teacher/subjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTeacherProfile.mockResolvedValue({
      id: "teacher-1",
      user_id: "user-1",
      handle: "ramesh",
      collection_sk: "collection-secret",
    });
    mocks.createTeacherSubject.mockResolvedValue({
      name: "Engineering Physics",
      slug: "engineering-physics",
      folder_path: "Engineering Physics",
    });
    const profileQuery = {
      upsert: vi.fn(async () => ({ error: null })),
    };
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => profileQuery),
    });
  });

  it("creates the subject using the server-side collection key", async () => {
    const response = await POST(request({ name: "  Engineering   Physics  " }));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.subject.name).toBe("Engineering Physics");
    expect(JSON.stringify(payload)).not.toContain("collection-secret");
    expect(mocks.createTeacherSubject).toHaveBeenCalledWith(
      "collection-secret",
      "Engineering Physics",
    );
  });

  it("rejects names that can escape the subject folder", async () => {
    const slashResponse = await POST(request({ name: "Physics/../../Other" }));
    const traversalResponse = await POST(request({ name: ".." }));

    expect(slashResponse.status).toBe(400);
    expect(traversalResponse.status).toBe(400);
    expect(mocks.createTeacherSubject).not.toHaveBeenCalled();
  });

  it("rejects a non-teacher before calling the collection API", async () => {
    mocks.getTeacherProfile.mockResolvedValue(null);

    const response = await POST(request({ name: "Physics" }));

    expect(response.status).toBe(401);
    expect(mocks.createTeacherSubject).not.toHaveBeenCalled();
  });

  it("returns a useful conflict when the subject already exists", async () => {
    mocks.createTeacherSubject.mockRejectedValue(
      new mocks.MockTeacherApiError("Subject already exists", 409),
    );

    const response = await POST(request({ name: "Physics" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Subject already exists" });
  });

  it("ignores legacy visibility input and creates a private base subject", async () => {
    const response = await POST(request({ name: "Physics", visibility: "public" }));

    expect(response.status).toBe(201);
    expect(mocks.createTeacherSubject).toHaveBeenCalledOnce();
    expect(mocks.createSupabaseAdminClient().from().upsert).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "private" }),
      { onConflict: "teacher_id,subject_slug" },
    );
  });

  it("always stores private visibility without linking a course", async () => {
    const response = await POST(request({ name: "Physics", visibility: "public" }));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ visibility: "private" });
  });
});
