import { NextRequest, NextResponse } from "next/server";
import { isProfileComplete } from "@/lib/access";
import { resolvePostAuthDestination } from "@/lib/post-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || request.cookies.get("oauth_next")?.value || null;
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

  const { data: profile } = await supabase
    .from("student_profiles")
    .select("full_name, college, board, grade, target_grade, language_pref, role")
    .eq("user_id", user.id)
    .maybeSingle();

  const onboarded = isProfileComplete(
    profile
      ? {
          fullName: profile.full_name ?? "",
          college: profile.college ?? "",
          board: profile.board ?? "",
          grade: profile.grade ?? "",
          targetGrade: profile.target_grade ?? "",
          languagePref: profile.language_pref ?? "EN",
        }
      : null,
  );

  const role = profile?.role === "admin" ? "admin" : "student";
  const destination = resolvePostAuthDestination({
    nextPath: next,
    onboarded,
    role,
  });

  const response = NextResponse.redirect(`${origin}${destination}`);
  response.cookies.set("oauth_next", "", {
    maxAge: 0,
    path: "/",
  });
  return response;
}
