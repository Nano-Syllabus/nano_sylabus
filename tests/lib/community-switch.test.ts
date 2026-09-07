import { describe, expect, it } from "vitest";
import type { CommunitySummary } from "@/lib/communities";
import { communitySwitchState, savedCommunitySlug } from "@/lib/community-switch";

function community(slug: string, creatorId = "owner", role = "creator", status = "active") {
  return {
    slug,
    name: slug,
    creatorId,
    status: "active",
    membership: { role, status },
  } as CommunitySummary;
}

describe("owner community switching authorization", () => {
  it("allows owned communities and the owner's active external membership", () => {
    const state = communitySwitchState(
      "owner",
      [community("first"), community("second"), community("joined", "other", "member")],
      "second",
    );
    expect(state.canSwitch).toBe(true);
    expect(state.selected?.slug).toBe("second");
    expect(state.options).toEqual([
      { slug: "first", name: "first", owned: true },
      { slug: "second", name: "second", owned: true },
      { slug: "joined", name: "joined", owned: false },
    ]);
  });

  it("does not enable switching for a regular member", () => {
    const state = communitySwitchState("student", [community("joined", "other", "member")]);
    expect(state.canSwitch).toBe(false);
    expect(state.options).toEqual([]);
    expect(state.selected?.slug).toBe("joined");
  });

  it("excludes revoked, archived and other creators' communities", () => {
    const archived = { ...community("archived"), status: "archived" } as CommunitySummary;
    const state = communitySwitchState(
      "owner",
      [
        community("mine"),
        community("revoked", "other", "member", "left"),
        community("not-mine", "other"),
        archived,
      ],
      "revoked",
    );
    expect(state.options.map((option) => option.slug)).toEqual(["mine"]);
    expect(state.selected?.slug).toBe("mine");
    expect(state.canSwitch).toBe(false);
  });

  it("falls back safely when the saved community is no longer accessible", () => {
    expect(
      communitySwitchState(
        "owner",
        [community("mine"), community("joined", "other", "member")],
        "unauthorized",
      ).selected?.slug,
    ).toBe("joined");
  });

  it("does not reuse another account's preference and tolerates malformed cookies", () => {
    const cookie = JSON.stringify({ userId: "owner", slug: "mine" });
    expect(savedCommunitySlug(cookie, "owner")).toBe("mine");
    expect(savedCommunitySlug(cookie, "other")).toBeUndefined();
    expect(savedCommunitySlug("invalid", "owner")).toBeUndefined();
    expect(savedCommunitySlug(undefined, "owner")).toBeUndefined();
  });
});
