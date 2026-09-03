import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteOwnedCommunity } from "@/lib/data/communities";

describe("community deletion service", () => {
  it("delegates all changes to a single atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "community-1", error: null });
    expect(
      await deleteOwnedCommunity("owner", "owned", "owned", { rpc } as unknown as SupabaseClient),
    ).toEqual({ deleted: true, communityId: "community-1" });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("delete_owned_community", {
      target_user_id: "owner",
      target_community_slug: "owned",
      confirmation_slug: "owned",
    });
  });
  it.each([
    ["42501", 403],
    ["P0002", 404],
    ["22023", 400],
    ["PGRST202", 503],
    ["42883", 503],
  ])("maps %s safely to %s", async (code, status) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code } });
    await expect(
      deleteOwnedCommunity("owner", "owned", "owned", { rpc } as unknown as SupabaseClient),
    ).rejects.toMatchObject({ status });
  });
});
