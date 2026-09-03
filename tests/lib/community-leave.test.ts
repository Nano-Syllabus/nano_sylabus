import { describe, expect, it, vi } from "vitest";
import { leaveCommunityMembership } from "@/lib/data/community-hub";

function client(role = "member", status = "active", creatorId = "owner") {
  const community = { id: "community-1", creator_id: creatorId };
  const membership = { role, status };
  const queries = [community, membership].map((data) => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data, error: null })),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    return query;
  });
  const admin = {
    from: vi.fn((table: string) => queries[table === "communities" ? 0 : 1]),
    rpc: vi.fn(async () => ({ data: null, error: null as null | Error })),
  };
  return { admin, queries };
}

describe("leave community membership service", () => {
  it("uses one atomic database operation scoped to this member and community", async () => {
    const { admin, queries } = client();
    expect(await leaveCommunityMembership("student", "henglish", admin as never)).toEqual({
      left: true,
    });
    expect(queries[0].eq).toHaveBeenCalledWith("slug", "henglish");
    expect(queries[0].eq).toHaveBeenCalledWith("status", "active");
    expect(queries[1].eq).toHaveBeenCalledWith("user_id", "student");
    expect(admin.rpc).toHaveBeenCalledExactlyOnceWith("leave_community", {
      target_user_id: "student",
      target_community_id: "community-1",
    });
  });
  it.each([
    ["creator", "active", "owner"],
    ["member", "active", "student"],
    ["member", "left", "owner"],
  ])("rejects owners or inactive members (%s, %s, %s)", async (role, status, owner) => {
    const { admin } = client(role, status, owner);
    await expect(
      leaveCommunityMembership("student", "henglish", admin as never),
    ).rejects.toMatchObject({ status: 403 });
    expect(admin.rpc).not.toHaveBeenCalled();
  });
  it("propagates database failure instead of reporting left", async () => {
    const { admin } = client();
    admin.rpc.mockResolvedValue({ data: null, error: new Error("RPC unavailable") });
    await expect(leaveCommunityMembership("student", "henglish", admin as never)).rejects.toThrow(
      "RPC unavailable",
    );
  });
});
