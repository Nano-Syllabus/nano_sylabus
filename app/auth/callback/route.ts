import { NextRequest, NextResponse } from "next/server";
import { isProfileComplete } from "@/lib/access";
import { resolvePostAuthDestination } from "@/lib/post-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const encodedCookieNext = request.cookies.get("oauth_next")?.value;
  let cookieNext: string | null = null;
  if (encodedCookieNext) {
    try {
      cookieNext = decodeURIComponent(encodedCookieNext);
    } catch {
      cookieNext = null;
    }
  }
  const next = url.searchParams.get("next") || cookieNext;
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=Missing%20auth%20code`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=Missing%20session`);
  }

  let { data: profile } = await supabase
    .from("student_profiles")
    .select("full_name, college, board, grade, target_grade, language_pref, subjects, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) {
    const fullName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split("@")[0] ||
      "Student";
    await supabase.from("student_profiles").upsert(
      {
        user_id: user.id,
        full_name: fullName,
        language_pref: "RN",
      },
      { onConflict: "user_id" },
    );
  }

  const role = profile?.role === "admin" ? "admin" : "student";
  const destination = resolvePostAuthDestination({
    nextPath: next,
    onboarded: true,
    role,
  });

  const response = NextResponse.redirect(`${origin}${destination}`);
  response.cookies.set("oauth_next", "", {
    maxAge: 0,
    path: "/",
    domain:
      url.hostname === "nanosyllabus.com" || url.hostname.endsWith(".nanosyllabus.com")
        ? ".nanosyllabus.com"
        : undefined,
  });
  return response;
}
