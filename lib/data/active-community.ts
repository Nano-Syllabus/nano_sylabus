import { cookies } from "next/headers";
import { timed } from "@/lib/dev-timing";
import { listJoinedCommunities } from "@/lib/data/communities";
import {
  ACTIVE_COMMUNITY_COOKIE,
  communitySwitchState,
  savedCommunitySlug,
} from "@/lib/community-switch";

export async function getActiveCommunity(userId: string, preferredSlug?: string) {
  const [joined, store] = await timed("page:getActiveCommunity", async () =>
    Promise.all([listJoinedCommunities(userId), cookies()]),
  );
  return communitySwitchState(
    userId,
    joined,
    preferredSlug || savedCommunitySlug(store.get(ACTIVE_COMMUNITY_COOKIE)?.value, userId),
  );
}
