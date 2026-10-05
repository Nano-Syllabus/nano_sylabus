import { cookies } from "next/headers";
import { timed } from "@/lib/dev-timing";
import { listJoinedCommunities } from "@/lib/data/communities";
import { getStudentExamEnrollment } from "@/lib/data/exam-enrollment";
import {
  ACTIVE_COMMUNITY_COOKIE,
  communitySwitchState,
  savedCommunitySlug,
} from "@/lib/community-switch";

export async function getActiveCommunity(userId: string, preferredSlug?: string) {
  const [joined, store, enrollment] = await timed("page:getActiveCommunity", async () =>
    Promise.all([listJoinedCommunities(userId), cookies(), getStudentExamEnrollment(userId)]),
  );
  if (enrollment) {
    const selected = joined.find((community) => community.id === enrollment.facultyId);
    return { selected, options: [], canSwitch: false };
  }
  return communitySwitchState(
    userId,
    joined,
    preferredSlug || savedCommunitySlug(store.get(ACTIVE_COMMUNITY_COOKIE)?.value, userId),
  );
}
