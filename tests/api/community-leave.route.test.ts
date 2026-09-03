import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), leave: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mocks.auth } }),
}));
vi.mock("@/lib/data/community-hub", () => ({
  leaveCommunityMembership: mocks.leave,
  setCommunityCurrentTerm: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { DELETE } from "@/app/api/communities/[slug]/membership/route";
import { CommunityError } from "@/lib/data/communities";

const context = { params: Promise.resolve({ slug: "henglish" }) };
const request = () =>
  new Request("http://localhost/api/communities/henglish/membership", {
    method: "DELETE",
    body: JSON.stringify({ userId: "another-student" }),
  });

describe("DELETE community membership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: "signed-in-student" } } });
    mocks.leave.mockResolvedValue({ left: true });
  });
  it("leaves only for the authenticated student and invalidates member views", async () => {
    const response = await DELETE(request(), context);
    expect(await response.json()).toEqual({ left: true });
    expect(response.status).toBe(200);
    expect(mocks.leave).toHaveBeenCalledExactlyOnceWith("signed-in-student", "henglish");
    expect(mocks.revalidate).toHaveBeenCalledWith("/app", "layout");
    expect(mocks.revalidate).toHaveBeenCalledWith("/communities", "layout");
  });
  it("does not mutate unauthenticated requests", async () => {
    mocks.auth.mockResolvedValue({ data: { user: null } });
    expect((await DELETE(request(), context)).status).toBe(401);
    expect(mocks.leave).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each([403, 404])("preserves membership and owner rejection (%s)", async (status) => {
    mocks.leave.mockRejectedValue(new CommunityError("Cannot leave this community", status));
    expect((await DELETE(request(), context)).status).toBe(status);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("does not report success or leak database errors", async () => {
    mocks.leave.mockRejectedValue(new Error("internal database detail"));
    const response = await DELETE(request(), context);
    expect(response.status).toBe(502);
    expect(await response.json()).not.toHaveProperty("left");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
