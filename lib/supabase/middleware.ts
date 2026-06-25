import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isProfileComplete, resolveAccess } from "@/lib/access";
import { getSupabaseEnv } from "@/lib/env";

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
        cookiesToSet.forEach(({ name, value, options }) =>
          request.cookies.set(name, value),
        );
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

  if (user) {
    const { data: profileRow } = await supabase
      .from("student_profiles")
      .select("full_name, college, board, grade, target_grade, language_pref, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileRow) {
      onboarded = isProfileComplete({
        fullName: profileRow.full_name ?? "",
        college: profileRow.college ?? "",
        board: profileRow.board ?? "",
        grade: profileRow.grade ?? "",
        targetGrade: profileRow.target_grade ?? "",
        languagePref: profileRow.language_pref ?? "RN",
      });
      role = profileRow.role ?? "student";
    } else {
      onboarded = false;
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
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
