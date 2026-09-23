import { SetAppShell } from "@/components/set-app-shell";
import { StudentDailyDashboardView } from "@/components/student-daily-dashboard";
import { requireOnboardedUser } from "@/lib/auth";
import { getActiveCommunity } from "@/lib/data/active-community";

export const dynamic = "force-dynamic";

/**
 * A SHELL, NOT A DATA PAGE.
 *
 * This used to `await getStudentDailyDashboard(...)` — the most expensive read
 * in the product, roughly 1.5s — before returning anything. A server component
 * cannot stream past its own awaits, so the RSC payload was gated on it and
 * `loading.tsx` covered the screen on EVERY visit, including a return a few
 * seconds after leaving. No client cache can shorten that, because what is
 * being waited on is the server render.
 *
 * What is left here is only what the page needs to draw its chrome correctly on
 * the first frame, and all of it is cheap:
 *
 *   requireOnboardedUser   ~120ms, and `cache()`d for the request
 *   getActiveCommunity     ~240ms, needed for the community switcher
 *
 * The dashboard itself now comes from `useDashboard` inside the view, which
 * holds it across client-side navigations — so moving between tabs stops
 * costing a server round trip at all, and the sidebar warms it on hover.
 *
 * The active-community read follows authentication because it needs `user.id`.
 */
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ community?: string }>;
}) {
  const { user, profile } = await requireOnboardedUser();
  const params = await searchParams;
  const active = await getActiveCommunity(
    user.id,
    typeof params.community === "string" ? params.community : undefined,
  );

  return (
    <>
      <SetAppShell title={null} />
      <StudentDailyDashboardView
        key={active.selected?.id ?? "none"}
        userId={user.id}
        communityOptions={active.options}
        fullName={user.fullName}
        creditBalance={user.creditBalance}
        hasUnlimitedAccess={user.hasUnlimitedAccess}
        studyQuote={profile?.studyQuote ?? undefined}
        /**
         * TWO DIFFERENT SLUGS, ON PURPOSE.
         *
         * `communitySlug` is the QUERY KEY and must be what the URL asked for —
         * `undefined` when there is no `?community=` — because the sidebar's
         * hover prefetch can only know that much. Keying on the RESOLVED slug
         * instead meant the prefetch warmed `["student","dashboard",""]` while
         * this page read `["student","dashboard","bct"]`: two cache entries,
         * two requests, and a prefetch that could never hit. The perf HUD
         * showed it as `/api/student/dashboard` listed twice.
         *
         * `selectedCommunitySlug` is for DISPLAY — the switcher has to show the
         * community actually in effect, which is the resolved one. The API
         * resolves the same default from an absent `community` param, so both
         * sides agree on the data while keying on the request.
         */
        communitySlug={typeof params.community === "string" ? params.community : undefined}
        selectedCommunitySlug={active.selected?.slug}
      />
    </>
  );
}
