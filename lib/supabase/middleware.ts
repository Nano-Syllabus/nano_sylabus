import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolveAccess } from "@/lib/access";
import { getSupabaseEnv } from "@/lib/env";
import type { AppRole } from "@/lib/types";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

type CookieToSet = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

export async function updateSession(request: NextRequest) {
  const { url, key } = getSupabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options as never),
        );
      },
    },
  });

  const {
    data: { user },
  } = await getVerifiedUser(supabase);

  const { pathname } = request.nextUrl;
  let role: AppRole = "student";

  /**
   * `/admin` is the only path that needs more than "is there a session".
   *
   * `resolveAccess` takes an `onboarded` flag but never reads it, and
   * `isProfileComplete` currently returns true unconditionally — so on every
   * other path the `student_profiles` lookup decided nothing while adding a
   * database round trip to each navigation. The `ns-gate` cookie existed only
   * to skip that lookup and went with it; a copy still sitting in a browser
   * expires by itself and is now read by nothing.
   *
   * Role is still read from the database, never from a cookie or a JWT claim,
   * on the one path that gates on it.
   */
  if (user && pathname.startsWith("/admin")) {
    const { data: profileRow } = await supabase
      .from("student_profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    role = profileRow?.role ?? "student";
  }

  const access = resolveAccess({
    pathname,
    hasUser: Boolean(user),
    onboarded: true,
    role,
  });

  if (!access.allow) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = access.redirectTo;
    if (access.includeNext) {
      redirectUrl.searchParams.set("next", pathname);
    } else {
      redirectUrl.search = "";
    }
    const redirectResponse = NextResponse.redirect(redirectUrl);
    // Carry the session cookies the auth client may have just refreshed, so a
    // redirect does not throw away a rotated token and force another refresh.
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  return response;
}
