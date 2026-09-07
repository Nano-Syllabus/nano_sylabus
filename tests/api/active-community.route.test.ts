import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), listJoined: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/data/communities", () => ({
  listJoinedCommunities: mocks.listJoined,
  communityStorageError: () => ({ status: 500, message: "Could not load communities." }),
}));
import { POST } from "@/app/api/student/active-community/route";

const owned = {
  slug: "mine",
  name: "Mine",
  creatorId: "owner",
  status: "active",
  membership: { role: "creator", status: "active" },
};
const joined = {
  ...owned,
  slug: "joined",
  creatorId: "other",
  membership: { role: "member", status: "active" },
};
function request(slug: string, origin = "http://localhost") {
  return new Request("http://localhost/api/student/active-community", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify({ slug }),
  });
}

describe("POST active community", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } } });
    mocks.listJoined.mockResolvedValue([owned, joined]);
  });
  it("saves an authenticated owner's joined community as an HTTP-only preference", async () => {
    const response = await POST(request("joined"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ slug: "joined" });
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(mocks.listJoined).toHaveBeenCalledWith("owner");
  });
  it("also allows switching back to the owner's own community", async () => {
    expect((await POST(request("mine"))).status).toBe(200);
  });
  it("rejects anonymous users", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(request("mine"))).status).toBe(401);
    expect(mocks.listJoined).not.toHaveBeenCalled();
  });
  it("rejects unrelated communities without setting a cookie", async () => {
    const response = await POST(request("stranger"));
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("rejects non-owners even when they send a valid joined slug", async () => {
    mocks.listJoined.mockResolvedValue([joined]);
    expect((await POST(request("joined"))).status).toBe(403);
  });
  it("rechecks revoked memberships on each switch", async () => {
    mocks.listJoined.mockResolvedValue([
      owned,
      { ...joined, membership: { role: "member", status: "left" } },
    ]);
    expect((await POST(request("joined"))).status).toBe(403);
  });
  it("rejects cross-origin requests", async () => {
    expect((await POST(request("mine", "https://unrelated.example"))).status).toBe(403);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("rejects invalid input", async () => {
    expect((await POST(request(""))).status).toBe(400);
  });
});
