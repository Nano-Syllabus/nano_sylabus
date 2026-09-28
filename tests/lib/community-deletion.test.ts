import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteOwnedCommunity } from "@/lib/data/communities";

/**
 * A Supabase double: the community lookup, the active-member count, and the
 * delete RPC. Every builder method returns the builder; the terminal awaits
 * resolve to the canned rows.
 */
function fakeAdmin({
  community = { id: "community-1", name: "BEI Engineering", creator_id: "owner" } as Record<
    string,
    unknown
  > | null,
  memberCount = 2,
  rpc = vi.fn().mockResolvedValue({ data: "community-1", error: null }),
} = {}) {
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq"]) builder[method] = () => builder;
    builder.maybeSingle = () => Promise.resolve({ data: community, error: null });
    if (table === "community_memberships") {
      builder.then = (resolve: (value: unknown) => unknown) =>
        resolve({ count: memberCount, error: null });
    }
    return builder;
  });
  return { admin: { from, rpc } as unknown as SupabaseClient, rpc };
}

describe("community deletion service", () => {
  it("confirms by the typed community name, then deletes through one atomic RPC", async () => {
    const { admin, rpc } = fakeAdmin();
    expect(await deleteOwnedCommunity("owner", "owned", "  BEI   Engineering ", admin)).toEqual({
      deleted: true,
      communityId: "community-1",
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("delete_owned_community", {
      target_user_id: "owner",
      target_community_slug: "owned",
      confirmation_slug: "owned",
    });
  });

  it("refuses a name that does not match, before touching anything", async () => {
    const { admin, rpc } = fakeAdmin();
    for (const typed of ["owned", "bei engineering", ""]) {
      await expect(deleteOwnedCommunity("owner", "owned", typed, admin)).rejects.toMatchObject({
        status: 400,
      });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a community with more than two members", async () => {
    const { admin, rpc } = fakeAdmin({ memberCount: 3 });
    await expect(
      deleteOwnedCommunity("owner", "owned", "BEI Engineering", admin),
    ).rejects.toMatchObject({ status: 409 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses anyone but the creator, and a missing community", async () => {
    await expect(
      deleteOwnedCommunity("someone", "owned", "BEI Engineering", fakeAdmin().admin),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      deleteOwnedCommunity("owner", "owned", "BEI Engineering", fakeAdmin({ community: null }).admin),
    ).rejects.toMatchObject({ status: 404 });
  });

  it.each([
    ["42501", 403],
    ["P0002", 404],
    ["22023", 400],
    ["PGRST202", 503],
    ["42883", 503],
  ])("maps %s safely to %s", async (code, status) => {
    const { admin } = fakeAdmin({ rpc: vi.fn().mockResolvedValue({ data: null, error: { code } }) });
    await expect(
      deleteOwnedCommunity("owner", "owned", "BEI Engineering", admin),
    ).rejects.toMatchObject({ status });
  });
});
