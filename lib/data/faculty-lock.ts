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

export type FacultyRef = { id: string; slug: string; name: string };

export const FACULTY_LOCKED_MESSAGE = "Your faculty is locked. Contact an admin to change it.";

export type AdminSite = { slug: string; name: string; faculties: FacultyRef[] };

/**
 * The subdomain site each admin runs (`landing_site_admins`; one site per admin, several admins per site) with
 * that site's supported faculties — what the admin may move between. Keyed by
 * user id. A missing table (migration not applied yet) reads as no sites, so
 * admins behave like students until it lands.
 */
export async function listAdminSites(userIds: string[]): Promise<Map<string, AdminSite>> {
  const byUser = new Map<string, AdminSite>();
  if (!userIds.length) return byUser;
  const admin = createSupabaseAdminClient();
  const { data: rows, error } = await admin
    .from("landing_site_admins")
    .select("user_id,site_slug,landing_sites!inner(name)")
    .in("user_id", userIds);
  if (error) {
    console.error("[faculty-access] could not read site admins", error.message);
    return byUser;
  }
  if (!rows?.length) return byUser;
  const { data: faculties, error: facultyError } = await admin
    .from("landing_exam_faculties")
    .select("exam_slug,communities!inner(id,slug,name,status)")
    .in("exam_slug", rows.map((row) => row.site_slug))
    .eq("is_active", true)
    .order("position");
  if (facultyError) throw facultyError;
  for (const row of rows) {
    const site = (Array.isArray(row.landing_sites)
      ? row.landing_sites[0]
      : row.landing_sites) as unknown as { name: string };
    byUser.set(row.user_id, {
      slug: row.site_slug,
      name: site.name,
      faculties: (faculties ?? [])
        .filter((faculty) => faculty.exam_slug === row.site_slug)
        .map(
          (faculty) =>
            (Array.isArray(faculty.communities)
              ? faculty.communities[0]
              : faculty.communities) as unknown as FacultyRef & { status: string },
        )
        .filter((faculty) => faculty.status === "active")
        .map(({ id, slug, name }) => ({ id, slug, name })),
    });
  }
  return byUser;
}

/**
 * Where this person may move past an exam-enrollment lock (user, 2026-10-07):
 * "all" for a super admin, their site's faculties for an admin (empty without
 * a site), and null for everyone else.
 */
export const getFacultySwitchAccess = cache(
  async (userId: string): Promise<"all" | FacultyRef[] | null> => {
    const { data, error } = await createSupabaseAdminClient()
      .from("student_profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (data?.role === "super_admin") return "all";
    if (data?.role !== "admin") return null;
    return (await listAdminSites([userId])).get(userId)?.faculties ?? [];
  },
);

type FacultyTarget = { slug?: string; id?: string };
const isTarget = (faculty: { slug?: string; id?: string }, target: FacultyTarget) =>
  (target.slug !== undefined && faculty.slug === target.slug) ||
  (target.id !== undefined && faculty.id === target.id);

/**
 * Why this person may not move to `target`, or null when they may:
 * - a super admin goes anywhere;
 * - an admin goes only to their subdomain site's faculties;
 * - everyone else (students, admins with no site) is pinned by an exam
 *   enrollment, if they have one.
 * Every place that refuses a faculty change asks here.
 */
export async function facultyChangeRefusal(
  userId: string,
  target: FacultyTarget,
): Promise<string | null> {
  const [enrollment, access] = await Promise.all([
    getStudentExamEnrollment(userId),
    getFacultySwitchAccess(userId),
  ]);
  if (access === "all") return null;
  if (access?.length) {
    return access.some((faculty) => isTarget(faculty, target))
      ? null
      : `You can switch only between your faculties: ${access.map((faculty) => faculty.name).join(", ")}.`;
  }
  if (enrollment && !isTarget({ slug: enrollment.facultySlug, id: enrollment.facultyId }, target))
    return FACULTY_LOCKED_MESSAGE;
  return null;
}

/** Whether this person's own access (not a student's pin) lets them move to `target`. */
export async function mayMovePastFacultyLock(userId: string, target: FacultyTarget) {
  const access = await getFacultySwitchAccess(userId);
  return access === "all" || Boolean(access?.some((faculty) => isTarget(faculty, target)));
}

/**
 * Drop a super admin's or site admin's own exam enrollment before they
 * move to `target`. The database guard (`guard_exam_faculty_membership`)
 * refuses every membership change for an enrolled user, whatever their role,
 * so skipping the app's check alone would only swap the friendly 409 for a raw
 * P0001. Admins are Pro by role, so the enrollment pins them to an exam's
 * prices they never pay; nothing is lost. Returns false (and changes nothing)
 * when the person may not move there or has no enrollment elsewhere.
 */
export async function releaseFacultyLockFor(userId: string, target: FacultyTarget) {
  const enrollment = await getStudentExamEnrollment(userId);
  if (!enrollment || isTarget({ slug: enrollment.facultySlug, id: enrollment.facultyId }, target))
    return false;
  if (!(await mayMovePastFacultyLock(userId, target))) return false;
  const { error } = await createSupabaseAdminClient()
    .from("student_exam_enrollments")
    .delete()
    .eq("user_id", userId);
  if (error) throw error;
  return true;
}

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

/**
 * The faculty this person studies in as a member (their joined faculty), or
 * null. Admins on a subdomain see it highlighted in the faculty picker.
 */
export async function currentMemberFacultySlug(userId: string): Promise<string | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from("community_memberships")
    .select("communities!inner(slug)")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("role", "member")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const community = (Array.isArray(data.communities)
    ? data.communities[0]
    : data.communities) as unknown as { slug: string };
  return community.slug;
}
