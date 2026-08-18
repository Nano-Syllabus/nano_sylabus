import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isProfileComplete, resolveAccess } from "@/lib/access";
import { getSupabaseEnv } from "@/lib/env";

type CookieToSet = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

/**
 * Remembers that a user has finished onboarding so the gate below can skip its
 * `student_profiles` round trip.
 *
 * This cookie is a performance hint, not a credential, and it is deliberately
 * limited to the one fact that is safe to get wrong. `httpOnly` keeps scripts
 * out but does not stop a hand-crafted request, so treat the contents as
 * attacker-controlled: the value is only consulted after `auth.getUser()` has
 * verified the session, and it is ignored unless it names that same verified
 * user. The worst a forged cookie can claim is "I am onboarded" about yourself,
 * which buys nothing — every /app page still runs `requireOnboardedUser()`
 * server-side and redirects if it is not true.
 *
 * Role is deliberately NOT cached here. It decides admin access, so it is
 * always read from the database on the paths that gate on it.
 */
const PROFILE_GATE_COOKIE = "ns-gate";
const PROFILE_GATE_MAX_AGE = 60 * 10;

function hasOnboardedGate(request: NextRequest, userId: string) {
  const raw = request.cookies.get(PROFILE_GATE_COOKIE)?.value;
  return Boolean(raw) && raw === userId;
}

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
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  let onboarded = false;
  let role: "student" | "admin" = "student";
  let gateToPersist: string | null = null;

  if (user) {
    // Admin paths gate on role, and role is never taken from the cookie, so
    // those always go to the database.
    const needsRole = pathname.startsWith("/admin");

    if (!needsRole && hasOnboardedGate(request, user.id)) {
      onboarded = true;
    } else {
      const { data: profileRow } = await supabase
        .from("student_profiles")
        .select("board, grade, role, subjects")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileRow) {
        onboarded = isProfileComplete({
          board: profileRow.board ?? "",
          grade: profileRow.grade ?? "",
          subjects: Array.isArray(profileRow.subjects) ? profileRow.subjects : [],
        });
        role = profileRow.role ?? "student";
      }

      if (onboarded) {
        gateToPersist = user.id;
      }
    }
  }

  const access = resolveAccess({
    pathname,
    hasUser: Boolean(user),
    onboarded,
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

  if (gateToPersist) {
    response.cookies.set(PROFILE_GATE_COOKIE, gateToPersist, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: PROFILE_GATE_MAX_AGE,
    });
  }

  if (!user && request.cookies.has(PROFILE_GATE_COOKIE)) {
    response.cookies.delete(PROFILE_GATE_COOKIE);
  }

  return response;
}
