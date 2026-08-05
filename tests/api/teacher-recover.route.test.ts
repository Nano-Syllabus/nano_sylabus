import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockTeacherOperatorApiError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
  }
  return {
    createSupabaseServerClient: vi.fn(),
    createSupabaseAdminClient: vi.fn(),
    getTeacherProfile: vi.fn(),
    getTeacherFromOperator: vi.fn(),
    regenerateTeacherKeyFromOperator: vi.fn(),
    createTeacherFromOperator: vi.fn(),
    collectionKeyFromOperatorPayload: vi.fn(),
    MockTeacherOperatorApiError,
    update: vi.fn(),
  };
});

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));
vi.mock("@/app/teachers/actions", () => ({ getTeacherProfile: mocks.getTeacherProfile }));
vi.mock("@/lib/teacher-app/operator", () => ({
  getTeacherFromOperator: mocks.getTeacherFromOperator,
  regenerateTeacherKeyFromOperator: mocks.regenerateTeacherKeyFromOperator,
  createTeacherFromOperator: mocks.createTeacherFromOperator,
  collectionKeyFromOperatorPayload: mocks.collectionKeyFromOperatorPayload,
  TeacherOperatorApiError: mocks.MockTeacherOperatorApiError,
}));

import { POST } from "@/app/api/teacher/recover/route";

function request(body: unknown = {}) {
  return new Request("http://localhost/api/teacher/recover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/teacher/recover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1", email: "teacher@example.com", user_metadata: { full_name: "Teacher One" } } } })) },
    });
    mocks.getTeacherProfile.mockResolvedValue({ id: "teacher-1", user_id: "user-1", handle: "teacher_one", collection_sk: "old-key" });
    mocks.getTeacherFromOperator.mockResolvedValue({ handle: "teacher_one" });
    mocks.regenerateTeacherKeyFromOperator.mockResolvedValue({ api_key: "new-key" });
    mocks.collectionKeyFromOperatorPayload.mockImplementation((payload: Record<string, unknown>) => payload.api_key || null);
    const chain = { update: mocks.update, eq: vi.fn() };
    mocks.update.mockReturnValue(chain);
    chain.eq.mockReturnValueOnce(chain).mockResolvedValueOnce({ error: null });
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => chain) });
  });

  it("regenerates and stores the key when the teacher exists in the operator tenant", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ recovered: true, recreated: false });
    expect(mocks.regenerateTeacherKeyFromOperator).toHaveBeenCalledWith("teacher_one");
    expect(mocks.update).toHaveBeenCalledWith({ collection_sk: "new-key" });
  });

  it("does not recreate a missing collection without explicit confirmation", async () => {
    mocks.getTeacherFromOperator.mockRejectedValue(new mocks.MockTeacherOperatorApiError("Not found", 404));

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ missing: true });
    expect(mocks.createTeacherFromOperator).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("creates a clean collection only after the teacher confirms", async () => {
    mocks.getTeacherFromOperator.mockRejectedValue(new mocks.MockTeacherOperatorApiError("Not found", 404));
    mocks.createTeacherFromOperator.mockResolvedValue({ api_key: "fresh-key" });

    const response = await POST(request({ recreate: true, confirmation: "RECREATE" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ recovered: true, recreated: true });
    expect(mocks.createTeacherFromOperator).toHaveBeenCalledWith({ handle: "teacher_one", name: "Teacher One", email: "teacher@example.com" });
    expect(mocks.update).toHaveBeenCalledWith({ collection_sk: "fresh-key" });
  });
});
