import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), save: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mocks.auth } }),
}));
vi.mock("@/lib/data/community-hub", () => ({
  setCommunityCurrentTerm: mocks.save,
  leaveCommunityMembership: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { PATCH } from "@/app/api/communities/[slug]/membership/route";
import { CommunityError } from "@/lib/data/communities";

const termId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ slug: "coding" }) };
const request = (body: unknown) =>
  new Request("http://localhost/api/communities/coding/membership", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("save a student's current semester", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: "student" } } });
    mocks.save.mockResolvedValue({ currentTermId: termId });
  });
  it("uses the signed-in member and refreshes the shared student view", async () => {
    const response = await PATCH(request({ termId, userId: "someone-else" }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ currentTermId: termId });
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith("student", "coding", termId);
    expect(mocks.revalidate).toHaveBeenCalledWith("/app", "layout");
  });
  it("requires sign-in", async () => {
    mocks.auth.mockResolvedValue({ data: { user: null } });
    expect((await PATCH(request({ termId }), context)).status).toBe(401);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each([null, {}, { termId: 2 }, { termId: "invalid" }])(
    "rejects invalid input %j",
    async (body) => {
      expect((await PATCH(request(body), context)).status).toBe(400);
      expect(mocks.save).not.toHaveBeenCalled();
    },
  );
  it.each([400, 403, 502])("does not claim a save after service failure (%s)", async (status) => {
    mocks.save.mockRejectedValue(new CommunityError("Could not save semester", status));
    const response = await PATCH(request({ termId }), context);
    expect(response.status).toBe(status);
    expect(await response.json()).not.toHaveProperty("currentTermId");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
