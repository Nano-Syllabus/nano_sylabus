import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { siteSlugFromHost } from "@/lib/landing-site-host";

export type StudentExamEnrollment = {
  examSlug: string;
  facultyId: string;
  facultySlug: string;
  facultyName: string;
  examName: string;
  selectedAt: string;
};

/**
 * Every exam site this student joined, newest first. A student holds one
 * faculty PER SUBDOMAIN (user, 2026-10-08): ioe → BCT and license → its
 * faculty can sit side by side for the same account.
 */
export const listStudentExamEnrollments = cache(
  async (userId: string): Promise<StudentExamEnrollment[]> => {
    const { data, error } = await createSupabaseAdminClient()
      .from("student_exam_enrollments")
      .select(
        "exam_slug,community_id,selected_at,communities!inner(slug,name),landing_sites!inner(name)",
      )
      .eq("user_id", userId)
      .order("selected_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => {
      const faculty = (Array.isArray(row.communities)
        ? row.communities[0]
        : row.communities) as unknown as { slug: string; name: string };
      const exam = (Array.isArray(row.landing_sites)
        ? row.landing_sites[0]
        : row.landing_sites) as unknown as { name: string };
      return {
        examSlug: row.exam_slug,
        facultyId: row.community_id,
        facultySlug: faculty.slug,
        facultyName: faculty.name,
        examName: exam.name,
        selectedAt: row.selected_at,
      };
    });
  },
);

/** The subdomain this request came in on, or null (main domain, or no request). */
async function requestSiteSlug(): Promise<string | null> {
  try {
    return siteSlugFromHost((await headers()).get("host"));
  } catch {
    return null;
  }
}

/** The member faculty the student studies in right now, by id. */
const activeMemberFacultyId = cache(async (userId: string): Promise<string | null> => {
  const { data, error } = await createSupabaseAdminClient()
    .from("community_memberships")
    .select("community_id")
    .eq("user_id", userId)
    .eq("role", "member")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.community_id ?? null;
});

/**
 * The student's enrollment for one exam site: `examSlug` when given, else the
 * subdomain this request is on. On the main domain (no site) it is the one they
 * study in now — the active member faculty — or their newest.
 */
export const getStudentExamEnrollment = cache(
  async (userId: string, examSlug?: string): Promise<StudentExamEnrollment | null> => {
    const all = await listStudentExamEnrollments(userId);
    if (!all.length) return null;
    const site = examSlug ?? (await requestSiteSlug());
    if (site) return all.find((enrollment) => enrollment.examSlug === site) ?? null;
    if (all.length === 1) return all[0];
    const active = await activeMemberFacultyId(userId);
    return all.find((enrollment) => enrollment.facultyId === active) ?? all[0];
  },
);

/**
 * Make this site's enrolled faculty the one the student studies in now (the
 * rest of the app reads a single active member faculty). Returns true when
 * something changed: the caller then drops the student's cached course access
 * and refreshes what it already rendered.
 */
export async function activateExamEnrollment(userId: string, examSlug: string) {
  const enrollment = await getStudentExamEnrollment(userId, examSlug);
  if (!enrollment) return false;
  if ((await activeMemberFacultyId(userId)) === enrollment.facultyId) return false;
  const { error } = await createSupabaseAdminClient().rpc("activate_exam_enrollment", {
    target_user_id: userId,
    target_exam_slug: examSlug,
  });
  if (error) throw error;
  return true;
}

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
  const [enrollments, access] = await Promise.all([
    listStudentExamEnrollments(userId),
    getFacultySwitchAccess(userId),
  ]);
  if (access === "all") return null;
  if (access?.length) {
    return access.some((faculty) => isTarget(faculty, target))
      ? null
      : `You can switch only between your faculties: ${access.map((faculty) => faculty.name).join(", ")}.`;
  }
  // A student with exam sites studies only in those sites' faculties (one per
  // site); they change one through that site's faculty dropdown.
  if (
    enrollments.length &&
    !enrollments.some((enrollment) =>
      isTarget({ slug: enrollment.facultySlug, id: enrollment.facultyId }, target),
    )
  )
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
 * Whether a student already has a faculty on this exam site, so they skip its
 * onboarding and go straight into the app. Joining ANOTHER site doesn't count
 * (one faculty per site, user 2026-10-08). A student from before exam sites —
 * a Browse member with no enrollment anywhere — counts as joined.
 */
export async function hasJoinedFaculty(userId: string, examSlug: string) {
  const [enrollments, member] = await Promise.all([
    listStudentExamEnrollments(userId),
    hasFacultyMembership(userId),
  ]);
  if (enrollments.some((enrollment) => enrollment.examSlug === examSlug)) return true;
  return !enrollments.length && member;
}

/** Reads the immutable learner scope using the caller’s database client. */
export const getStudentFacultyId = cache(
  async (userId: string, admin: SupabaseClient): Promise<string | null> => {
    // A student may hold one faculty per site; the one in use is the active
    // member faculty among them, else the newest.
    const { data, error } = await admin
      .from("student_exam_enrollments")
      .select("community_id")
      .eq("user_id", userId)
      .order("selected_at", { ascending: false });
    if (error) throw error;
    if (!data?.length) return null;
    if (data.length === 1) return data[0].community_id;
    const active = await activeMemberFacultyId(userId);
    return data.find((row) => row.community_id === active)?.community_id ?? data[0].community_id;
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
