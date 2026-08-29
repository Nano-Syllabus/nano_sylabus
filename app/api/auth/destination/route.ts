import { NextResponse } from "next/server";
import { isProfileComplete } from "@/lib/access";
import { isAdminRole } from "@/lib/admin-role";
import { resolvePostAuthDestination } from "@/lib/post-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const nextPath = url.searchParams.get("next");

  const { data: profile } = await supabase
    .from("student_profiles")
    .select("full_name, college, board, grade, target_grade, language_pref, subjects, role")
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
          subjects: Array.isArray(profile.subjects) ? profile.subjects : [],
        }
      : null,
  );

  const role = isAdminRole(profile?.role) ? profile?.role : "student";
  const destination = resolvePostAuthDestination({
    nextPath,
    onboarded,
    role,
  });

  return NextResponse.json({ destination });
}
