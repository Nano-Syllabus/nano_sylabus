import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSuperAdminRequest } from "@/lib/admin-access";
import { grantAdminSubscription, listAdminSubscriptionPlans } from "@/lib/data/admin-subscriptions";
import {
  getEnrollmentExam,
  getStudentExamEnrollment,
  listEnrollmentExams,
  selectExamFaculty,
} from "@/lib/data/exam-enrollment";
import { LandingSiteError } from "@/lib/data/landing-sites";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Context = { params: Promise<{ userId: string }> };

const DAY_MS = 24 * 60 * 60 * 1000;
const giftSchema = z.object({
  planId: z.string().uuid(),
  months: z.number().int().min(1).max(24),
  examSlug: z.string().min(1).max(40),
  facultyId: z.string().uuid(),
  /** Needed when the student is locked to another faculty; moving them is deliberate. */
  changeFaculty: z.boolean().default(false),
});

/** What the gift form offers: the paid plans, each exam's faculties, and where the student is locked now. */
export async function GET(_request: Request, { params }: Context) {
  const access = await assertSuperAdminRequest();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const { userId } = await params;
  try {
    const [plans, exams, enrollment] = await Promise.all([
      listAdminSubscriptionPlans(),
      listEnrollmentExams(),
      getStudentExamEnrollment(userId),
    ]);
    return NextResponse.json({
      plans: plans
        .filter(
          (plan) =>
            plan.isActive && plan.productType === "individual" && plan.billingType === "monthly",
        )
        .map((plan) => ({ id: plan.id, name: plan.name })),
      exams: exams.map((exam) => ({
        slug: exam.slug,
        name: exam.name,
        faculties: exam.faculties.map((faculty) => ({ id: faculty.id, name: faculty.name })),
      })),
      enrollment: enrollment
        ? {
            examSlug: enrollment.examSlug,
            facultyId: enrollment.facultyId,
            facultyName: enrollment.facultyName,
          }
        : null,
    });
  } catch (error) {
    console.error("[admin/gift-plan]", error);
    return NextResponse.json({ error: "Could not load the gift options." }, { status: 500 });
  }
}

/**
 * Gift a paid plan for a number of months, for ONE faculty. The student is locked
 * to that faculty (an exam enrolment, the same lock a paying student gets), so the
 * plan only ever opens that faculty's study space.
 */
export async function POST(request: Request, { params }: Context) {
  const access = await assertSuperAdminRequest();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = giftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Choose a plan, a number of months and a faculty." },
      { status: 400 },
    );
  const { userId } = await params;
  const gift = parsed.data;

  try {
    const admin = createSupabaseAdminClient();
    const { data: person } = await admin
      .from("student_profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (!person)
      return NextResponse.json({ error: "This person could not be found." }, { status: 404 });
    if (person.role !== "student")
      return NextResponse.json(
        { error: "Plans are gifted to students; admins already have full access." },
        { status: 400 },
      );

    const plan = (await listAdminSubscriptionPlans()).find(
      (candidate) =>
        candidate.id === gift.planId &&
        candidate.isActive &&
        candidate.productType === "individual" &&
        candidate.billingType === "monthly",
    );
    if (!plan)
      return NextResponse.json({ error: "Choose an active Plus or Pro plan." }, { status: 400 });

    const exam = await getEnrollmentExam(gift.examSlug);
    if (!exam?.faculties.some((faculty) => faculty.id === gift.facultyId))
      return NextResponse.json({ error: "Choose a faculty that exam supports." }, { status: 400 });

    const existing = await getStudentExamEnrollment(userId);
    const moves =
      existing && (existing.examSlug !== gift.examSlug || existing.facultyId !== gift.facultyId);
    if (moves && !gift.changeFaculty)
      return NextResponse.json(
        { error: `This student is locked to ${existing.facultyName}. Confirm to move them.` },
        { status: 409 },
      );

    // Lock first: if the faculty can't be set, no plan is handed out.
    let answers: Record<string, string> = {};
    if (existing) {
      const { data } = await admin
        .from("student_exam_enrollments")
        .select("preparation_answers")
        .eq("user_id", userId)
        .maybeSingle();
      answers = (data?.preparation_answers as Record<string, string>) ?? {};
    }
    await selectExamFaculty(userId, gift.examSlug, gift.facultyId, answers, true);

    const now = Date.now();
    const subscriptionId = await grantAdminSubscription({
      userId,
      planId: plan.id,
      startsAt: new Date(now).toISOString(),
      endsAt: new Date(now + gift.months * 30 * DAY_MS).toISOString(),
    });
    revalidatePath("/app", "layout");
    return NextResponse.json({ subscriptionId }, { status: 201 });
  } catch (error) {
    if (error instanceof LandingSiteError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[admin/gift-plan]", error);
    return NextResponse.json({ error: "Could not gift the plan. Please retry." }, { status: 500 });
  }
}
