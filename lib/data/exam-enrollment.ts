import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { unstable_cache } from "next/cache";
import {
  ENROLLMENT_EXAMS_TAG,
  getPublishedLandingSite,
  LandingSiteError,
} from "@/lib/data/landing-sites";
import { readExamConfig, validateExamAnswers, type ExamConfig } from "@/lib/exam-enrollment";
import { listSubscriptionPlans } from "@/lib/data/billing";
import { ensureCommunityLearningSpace } from "@/lib/community-learning";
import { invalidateStudentCourseAccess } from "@/lib/student-courses";
import { z } from "zod";
import { getStudentExamEnrollment } from "@/lib/data/faculty-lock";

export type ExamFaculty = {
  id: string;
  slug: string;
  name: string;
  faculty: string | null;
  university: string | null;
  subjects: Array<{ id: string; name: string }>;
};
export type EnrollmentExam = {
  slug: string;
  name: string;
  config: ExamConfig;
  faculties: ExamFaculty[];
};
export { getStudentExamEnrollment } from "@/lib/data/faculty-lock";
export type { StudentExamEnrollment } from "@/lib/data/faculty-lock";

export async function getEnrollmentExam(slug: string): Promise<EnrollmentExam | null> {
  const site = await getPublishedLandingSite(slug);
  if (!site?.examConfig.enabled) return null;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("landing_exam_faculties")
    .select(
      "community_id, position, communities!inner(id,slug,name,faculty,university,status,visibility,community_subjects(id,name,status,publication_status,position))",
    )
    .eq("exam_slug", slug)
    .eq("is_active", true)
    .order("position");
  if (error) throw error;
  const faculties: ExamFaculty[] = (data ?? []).flatMap((row) => {
    const c = (Array.isArray(row.communities)
      ? row.communities[0]
      : row.communities) as unknown as Record<string, unknown>;
    if (!c || c.status !== "active" || c.visibility !== "public") return [];
    const subjects = (Array.isArray(c.community_subjects) ? c.community_subjects : []) as Array<
      Record<string, unknown>
    >;
    return [
      {
        id: String(c.id),
        slug: String(c.slug),
        name: String(c.name),
        faculty: c.faculty as string | null,
        university: c.university as string | null,
        subjects: subjects
          .filter((s) => s.status === "active" && s.publication_status === "published")
          .sort((a, b) => Number(a.position) - Number(b.position))
          .map((s) => ({ id: String(s.id), name: String(s.name) })),
      },
    ];
  });
  return { slug: site.slug, name: site.name, config: site.examConfig, faculties };
}

/**
 * Every live exam with its faculties, for the in-app faculty picker.
 *
 * The same list for everyone, and the app layout reads it on every page a
 * student without a faculty opens — uncached that was ~370 ms of sequential
 * queries per navigation. Publishing a site and editing a faculty clear it
 * (ENROLLMENT_EXAMS_TAG); anything else, such as a subject being published,
 * shows within a minute.
 */
export const listEnrollmentExams = unstable_cache(readEnrollmentExams, ["enrollment-exams"], {
  revalidate: 60,
  tags: [ENROLLMENT_EXAMS_TAG],
});

async function readEnrollmentExams(): Promise<EnrollmentExam[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from("landing_sites")
    .select("slug,exam_config")
    .eq("status", "live");
  if (error) throw error;
  const exams = await Promise.all(
    (data ?? [])
      .filter((s) => readExamConfig(s.exam_config).enabled)
      .map((s) => getEnrollmentExam(s.slug)),
  );
  return exams.filter((exam): exam is EnrollmentExam => Boolean(exam?.faculties.length));
}

export async function getExamPlans(exam: EnrollmentExam) {
  // Public checkout must show prices before sign-in; the regular billing read
  // uses authenticated RLS. Keep the service read limited to active plans.
  const plans = await listSubscriptionPlans(createSupabaseAdminClient());
  return plans
    .filter(
      (plan) =>
        plan.productType === "individual" &&
        plan.billingType === "monthly" &&
        plan.price > 0 &&
        (!exam.config.planIds.length || exam.config.planIds.includes(plan.id)),
    )
    .sort((a, b) =>
      exam.config.planIds.length
        ? exam.config.planIds.indexOf(a.id) - exam.config.planIds.indexOf(b.id)
        : 0,
    );
}

export async function selectExamFaculty(
  userId: string,
  examSlug: string,
  facultyId: string,
  answers: unknown,
  allowChange = false,
) {
  // Check before provisioning learning services; the RPC repeats this check
  // under a per-student transaction lock to handle concurrent requests.
  if (!allowChange) {
    const existing = await getStudentExamEnrollment(userId);
    if (existing && (existing.examSlug !== examSlug || existing.facultyId !== facultyId)) {
      throw new LandingSiteError(
        "Your faculty is already locked. Contact an admin to change it.",
        409,
      );
    }
  }
  const exam = await getEnrollmentExam(examSlug);
  if (!exam) throw new LandingSiteError("This exam is not available.", 404);
  if (!exam.faculties.some((faculty) => faculty.id === facultyId))
    throw new LandingSiteError("Choose a supported faculty for this exam.", 400);
  let cleanAnswers: Record<string, string>;
  try {
    cleanAnswers = allowChange
      ? z.record(z.string().max(100)).parse(answers)
      : validateExamAnswers(exam.config, answers);
  } catch (error) {
    throw new LandingSiteError((error as Error).message, 400);
  }
  const admin = createSupabaseAdminClient();
  // Ensure the existing subjects/course bridge is ready before committing the choice.
  await ensureCommunityLearningSpace(admin, facultyId);
  const { error } = await admin.rpc("select_exam_faculty", {
    target_user_id: userId,
    target_exam_slug: examSlug,
    target_community_id: facultyId,
    preparation_answers: cleanAnswers,
    allow_change: allowChange,
  });
  if (error)
    throw new LandingSiteError(
      error.code === "23505" || error.code === "P0001"
        ? "Your faculty is already locked. Contact an admin to change it."
        : "Could not save your faculty. Please retry.",
      error.code === "23505" || error.code === "P0001" ? 409 : 500,
    );
  invalidateStudentCourseAccess(userId);
  return { examSlug, facultyId };
}
