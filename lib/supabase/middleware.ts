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
 * `student_profiles` round trip. Only a positive result is ever trusted: an
 * account that has just onboarded is re-checked against the database until the
 * cookie is written, so the gate can never strand someone on /onboarding with
 * stale data. Going the other way is harmless because every /app page still
 * runs `requireOnboardedUser()` server-side.
 */
const PROFILE_GATE_COOKIE = "ns-gate";
const PROFILE_GATE_MAX_AGE = 60 * 10;

type ProfileGate = { userId: string; role: "student" | "admin" };

function readProfileGate(request: NextRequest, userId: string): ProfileGate | null {
  const raw = request.cookies.get(PROFILE_GATE_COOKIE)?.value;
  if (!raw) return null;

  const [cookieUserId, role] = raw.split(":");
  if (cookieUserId !== userId) return null;
  if (role !== "student" && role !== "admin") return null;

  return { userId: cookieUserId, role };
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
  let gateToPersist: ProfileGate | null = null;

  if (user) {
    const cachedGate = readProfileGate(request, user.id);

    if (cachedGate) {
      onboarded = true;
      role = cachedGate.role;
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
        gateToPersist = { userId: user.id, role };
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
    response.cookies.set(PROFILE_GATE_COOKIE, `${gateToPersist.userId}:${gateToPersist.role}`, {
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
