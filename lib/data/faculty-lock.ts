import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type StudentExamEnrollment = {
  examSlug: string;
  facultyId: string;
  facultySlug: string;
  facultyName: string;
  examName: string;
  selectedAt: string;
};

export const getStudentExamEnrollment = cache(
  async (userId: string): Promise<StudentExamEnrollment | null> => {
    const { data, error } = await createSupabaseAdminClient()
      .from("student_exam_enrollments")
      .select(
        "exam_slug,community_id,selected_at,communities!inner(slug,name),landing_sites!inner(name)",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const faculty = (Array.isArray(data.communities)
      ? data.communities[0]
      : data.communities) as unknown as { slug: string; name: string };
    const exam = (Array.isArray(data.landing_sites)
      ? data.landing_sites[0]
      : data.landing_sites) as unknown as { name: string };
    return {
      examSlug: data.exam_slug,
      facultyId: data.community_id,
      facultySlug: faculty.slug,
      facultyName: faculty.name,
      examName: exam.name,
      selectedAt: data.selected_at,
    };
  },
);

/** Whether a student is an active member of any faculty (joined from Browse). */
export const hasFacultyMembership = cache(async (userId: string) => {
  const { data, error } = await createSupabaseAdminClient()
    .from("community_memberships")
    .select("community_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1);
  if (error) throw error;
  return Boolean(data?.length);
});

/**
 * Whether a student already studies somewhere: an exam enrollment or any active
 * faculty membership. Such a student skips a site's onboarding and goes straight
 * into the app, which opens their own faculty.
 */
export async function hasJoinedFaculty(userId: string) {
  const [enrollment, member] = await Promise.all([
    getStudentExamEnrollment(userId),
    hasFacultyMembership(userId),
  ]);
  return Boolean(enrollment) || member;
}

/** Reads the immutable learner scope using the caller’s database client. */
export const getStudentFacultyId = cache(
  async (userId: string, admin: SupabaseClient): Promise<string | null> => {
    const { data, error } = await admin
      .from("student_exam_enrollments")
      .select("community_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data?.community_id ?? null;
  },
);

/** Undefined means no faculty lock; null means the locked course is unavailable. */
export const getStudentFacultyCourseId = cache(
  async (userId: string, admin: SupabaseClient): Promise<string | null | undefined> => {
    const facultyId = await getStudentFacultyId(userId, admin);
    if (!facultyId) return undefined;
    const { data, error } = await admin
      .from("communities")
      .select("study_course_id")
      .eq("id", facultyId)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    return data?.study_course_id ?? null;
  },
);
