import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { isProfileComplete } from "@/lib/access";
import { ensureStarterCreditsForUser, getCreditBalanceForUser } from "@/lib/data/billing";
import {
  normalizeBoard,
  normalizeBoardScore,
  normalizeCollege,
  normalizeFullName,
  normalizeGrade,
  normalizeSubjects,
  normalizeTargetGrade,
} from "@/lib/profile-normalization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppUser, StudentProfile } from "@/lib/types";

function normalizeProfile(row: any): StudentProfile {
  return {
    userId: row.user_id,
    fullName: normalizeFullName(row.full_name ?? ""),
    college: normalizeCollege(row.college ?? ""),
    board: normalizeBoard(row.board ?? ""),
    grade: normalizeGrade(row.grade ?? ""),
    boardScore: row.board_score ? normalizeBoardScore(row.board_score) : null,
    subjects: normalizeSubjects(row.subjects ?? []),
    targetGrade: normalizeTargetGrade(row.target_grade ?? ""),
    languagePref: row.language_pref ?? "EN",
    role: row.role ?? "student",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAppUser(
  user: User,
  profile: StudentProfile | null,
  creditBalance: number,
): AppUser {
  return {
    id: user.id,
    email: user.email ?? "",
    fullName:
      profile?.fullName ||
      (typeof user.user_metadata.full_name === "string"
        ? user.user_metadata.full_name
        : "") ||
      (user.email?.split("@")[0] ?? "Student"),
    onboarded: isProfileComplete(profile),
    role: profile?.role ?? "student",
    creditBalance,
  };
}

export async function getCurrentAuth() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, profile: null };

  const { data: profileRow } = await supabase
    .from("student_profiles")
    .select("*")
    .eq("user_id", user.id)
      .maybeSingle();

  const profile: StudentProfile | null = profileRow ? normalizeProfile(profileRow) : null;
  const onboarded = isProfileComplete(profile);
  const creditBalance = onboarded
    ? await ensureStarterCreditsForUser(user.id)
    : await getCreditBalanceForUser(user.id);

  return {
    user: toAppUser(user, profile, creditBalance),
    profile,
  };
}

export async function requireAuthenticatedUser() {
  const auth = await getCurrentAuth();
  if (!auth.user) redirect("/login");
  return auth;
}

export async function requireOnboardedUser() {
  const auth = await requireAuthenticatedUser();
  if (!auth.user.onboarded) redirect("/onboarding");
  return auth;
}

export async function requireAdminUser() {
  const auth = await requireAuthenticatedUser();
  if (auth.user.role !== "admin") redirect(auth.user.onboarded ? "/app/chat" : "/onboarding");
  return auth;
}
