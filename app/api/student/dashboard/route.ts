import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { getStudentDailyDashboard } from "@/lib/data/student-daily-dashboard";
import { errorJson, privateJson } from "@/lib/http/cache";

export const dynamic = "force-dynamic";

/**
 * The Daily Dashboard's data, as a cacheable read.
 *
 * WHY THIS ROUTE EXISTS AT ALL
 * ----------------------------
 * `getStudentDailyDashboard` is the most expensive read in the product — it
 * runs the whole challenge chain and the community hub — and it used to be
 * awaited inside the `/app/today` server component. That meant the RSC payload
 * could not begin to stream until it finished, so `loading.tsx` covered the
 * screen on EVERY visit to the dashboard, including a return two seconds after
 * leaving it. No amount of client caching can help while the server render is
 * the thing being waited on.
 *
 * Moving it behind a route makes it cacheable by the one layer that can
 * actually skip the wait: TanStack Query in the browser, which holds the answer
 * across client-side navigations and re-serves it instantly. The page shell now
 * renders in ~250ms with the chrome already correct, and the data arrives from
 * memory rather than from Kathmandu.
 *
 * `community` scopes the dashboard to the student's selected community, and it
 * is part of the query key on the client for the same reason it is a parameter
 * here: switching community must not show the previous community's numbers.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user) return errorJson("Unauthorized", 401);

    const params = new URL(request.url).searchParams;
    const community = params.get("community") || undefined;
    const month = params.get("month") || undefined;
    const dashboard = await getStudentDailyDashboard(user.id, undefined, community, month);

    // 60s, matching `dashboardQuery`'s staleTime in lib/query/dashboard.ts.
    // The two windows are deliberately the same number: the query decides
    // whether to ask at all, this decides whether asking costs a body, and a
    // client told to hold something longer than the server considers it valid
    // is the mismatch that makes one cache serve what the other has discarded.
    return privateJson({ dashboard }, { request, profile: { maxAge: 60, swr: 300 } });
  } catch (error) {
    return errorJson(
      error instanceof Error ? error.message : "Could not load your dashboard.",
      502,
    );
  }
}
