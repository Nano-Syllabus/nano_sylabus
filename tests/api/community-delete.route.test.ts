import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), remove: vi.fn(), rename: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mocks.auth } }),
}));
vi.mock("@/lib/data/communities", async (original) => ({
  ...(await original<typeof import("@/lib/data/communities")>()),
  deleteOwnedCommunity: mocks.remove,
  updateOwnedCommunityName: mocks.rename,
}));
import { DELETE, PATCH } from "@/app/api/communities/[slug]/route";
import { CommunityError } from "@/lib/data/communities";
const context = { params: Promise.resolve({ slug: "owned" }) };
const request = (body: unknown) =>
  new Request("http://localhost/api/communities/owned", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const patchRequest = (body: unknown) =>
  new Request("http://localhost/api/communities/owned", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("DELETE community route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: "signed-in-owner" } } });
    mocks.remove.mockResolvedValue({ deleted: true, communityId: "community-1" });
    mocks.rename.mockResolvedValue({ id: "community-1", slug: "owned", name: "Renamed community" });
  });
  it("uses the authenticated identity, never the caller's claimed owner", async () => {
    const response = await DELETE(request({ confirmation: "owned", userId: "forged" }), context);
    expect(response.status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith("signed-in-owner", "owned", "owned");
    expect(await response.json()).toEqual({ deleted: true, communityId: "community-1" });
  });
  it("requires sign in", async () => {
    mocks.auth.mockResolvedValue({ data: { user: null } });
    expect((await DELETE(request({ confirmation: "owned" }), context)).status).toBe(401);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it.each([{}, null, { confirmation: true }, { confirmation: "wrong" }])(
    "requires explicit exact confirmation: %j",
    async (body) => {
      expect((await DELETE(request(body), context)).status).toBe(400);
      expect(mocks.remove).not.toHaveBeenCalled();
    },
  );
  it.each([403, 404, 503])("preserves a service rejection (%s)", async (status) => {
    mocks.remove.mockRejectedValue(new CommunityError("Not allowed or unavailable", status));
    expect((await DELETE(request({ confirmation: "owned" }), context)).status).toBe(status);
  });
  it("does not report success or expose internal errors on failure", async () => {
    mocks.remove.mockRejectedValue(new Error("internal database details"));
    const response = await DELETE(request({ confirmation: "owned" }), context);
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("internal database details");
  });
});

describe("PATCH community route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: "signed-in-owner" } } });
    mocks.rename.mockResolvedValue({ id: "community-1", slug: "owned", name: "Renamed community" });
  });

  it("updates the name using the authenticated creator", async () => {
    const response = await PATCH(patchRequest({ name: "Renamed community", userId: "forged" }), context);
    expect(response.status).toBe(200);
    expect(mocks.rename).toHaveBeenCalledWith("signed-in-owner", "owned", "Renamed community");
    await expect(response.json()).resolves.toEqual({
      community: { id: "community-1", slug: "owned", name: "Renamed community" },
    });
  });

  it.each([{}, null, { name: "x" }, { name: "" }])("rejects an invalid name: %j", async (body) => {
    expect((await PATCH(patchRequest(body), context)).status).toBe(400);
    expect(mocks.rename).not.toHaveBeenCalled();
  });

  it("requires sign in before renaming", async () => {
    mocks.auth.mockResolvedValueOnce({ data: { user: null } });
    expect((await PATCH(patchRequest({ name: "Renamed community" }), context)).status).toBe(401);
    expect(mocks.rename).not.toHaveBeenCalled();
  });
});
