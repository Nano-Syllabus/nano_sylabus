import { redirect } from "next/navigation";
import { getCurrentAuth } from "@/lib/auth";
import { enrollStudentInCourse, getPublishedCourse } from "@/lib/student-courses";
import { cookies } from "next/headers";
import {
  getEnrollmentExam,
  getExamPlans,
  getStudentExamEnrollment,
} from "@/lib/data/exam-enrollment";
import { EXAM_INTENT_COOKIE, readExamIntent } from "@/lib/exam-enrollment";
import { ExamCheckout, ExamPreparationFlow } from "@/components/exam-enrollment-flow";
import { getActiveManualPaymentConfig, hasActiveSubscription } from "@/lib/data/billing";
import { hasJoinedFaculty } from "@/lib/data/faculty-lock";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ intent?: string }>;
};

export const dynamic = "force-dynamic";

export default async function CoursePaymentPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const paymentPath = `/payment/${encodeURIComponent(slug)}`;
  const storedIntent =
    readExamIntent((await searchParams).intent) ??
    readExamIntent((await cookies()).get(EXAM_INTENT_COOKIE)?.value);
  const intent = storedIntent?.examSlug === slug ? storedIntent : null;
  // Payment stays on the host it was opened on: each subdomain signs in and
  // pays on its own dashboard (user, 2026-10-08).
  const { user } = await getCurrentAuth();

  const exam = await getEnrollmentExam(slug);
  if (exam) {
    const plans = await getExamPlans(exam);
    if (!user)
      return (
        <ExamPreparationFlow exam={exam} plans={plans} initialStep="plans" initialIntent={intent} />
      );
    // Joined and already paying: nothing left to do here.
    if ((await hasJoinedFaculty(user.id, slug)) && (await hasActiveSubscription(user.id)))
      redirect("/app/challenges");
    const [enrollment, paymentConfig] = await Promise.all([
      getStudentExamEnrollment(user.id, slug),
      getActiveManualPaymentConfig(),
    ]);
    return (
      <ExamCheckout
        exam={exam}
        plans={plans}
        intent={intent}
        enrollment={enrollment}
        paymentConfig={paymentConfig}
      />
    );
  }

  if (!user) redirect(`/login?next=${encodeURIComponent(paymentPath)}`);
  if (!user.onboarded) redirect(`/onboarding?next=${encodeURIComponent(paymentPath)}`);

  const course = await getPublishedCourse(slug);
  if (!course) redirect("/exams");

  try {
    await enrollStudentInCourse(user.id, slug);
  } catch (error) {
    console.error("Enrollment error:", error);
  }

  redirect("/app/today");
}
