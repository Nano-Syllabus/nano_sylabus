import { selectStudentCommunity, type CommunitySummary } from "@/lib/communities";

export const ACTIVE_COMMUNITY_COOKIE = "nano_active_community";

export type CommunitySwitchOption = {
  slug: string;
  name: string;
  owned: boolean;
};

/** A preference never grants access: rebuild the choices from active memberships. */
export function communitySwitchState(
  userId: string,
  communities: CommunitySummary[],
  preferredSlug?: string | null,
) {
  const accessible = communities.filter(
    (community) =>
      community.status === "active" &&
      community.membership?.status === "active" &&
      (community.creatorId === userId || community.membership.role === "member"),
  );
  const isOwner = accessible.some((community) => community.creatorId === userId);
  // The faculty a student JOINED is the one they study in, always. A creator's
  // own communities are workspaces; a remembered preference for one of them
  // must not pull the Challenge Hub or Revision away from the joined faculty
  // (the settings switcher that set that preference is gone, 2026-09-28).
  const joined = accessible.find((community) => community.membership?.role === "member");
  const selected =
    joined ?? selectStudentCommunity(accessible, isOwner ? preferredSlug : undefined);
  const options: CommunitySwitchOption[] = isOwner
    ? accessible.map((community) => ({
        slug: community.slug,
        name: community.name,
        owned: community.creatorId === userId,
      }))
    : [];
  return { selected, options, canSwitch: isOwner && options.length > 1 };
}

export function savedCommunitySlug(value: string | undefined, userId: string): string | undefined {
  if (!value) return undefined;
  try {
    const saved = JSON.parse(value);
    return saved?.userId === userId && typeof saved.slug === "string" ? saved.slug : undefined;
  } catch {
    return undefined;
  }
}
