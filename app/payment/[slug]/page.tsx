import { redirect } from "next/navigation";
import { getCurrentAuth } from "@/lib/auth";
import { enrollStudentInCourse, getPublishedCourse } from "@/lib/student-courses";
import { cookies, headers } from "next/headers";
import { mainAppOrigin } from "@/lib/landing-site-host";
import {
  getEnrollmentExam,
  getExamPlans,
  getStudentExamEnrollment,
} from "@/lib/data/exam-enrollment";
import { EXAM_INTENT_COOKIE, readExamIntent } from "@/lib/exam-enrollment";
import { ExamCheckout, ExamPreparationFlow } from "@/components/exam-enrollment-flow";
import { getActiveManualPaymentConfig } from "@/lib/data/billing";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ intent?: string }>;
};

export const dynamic = "force-dynamic";

export default async function CoursePaymentPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { user } = await getCurrentAuth();
  const paymentPath = `/payment/${encodeURIComponent(slug)}`;

  const exam = await getEnrollmentExam(slug);
  if (exam) {
    const plans = await getExamPlans(exam);
    // The link from a subdomain carries the student's choices; a cookie covers same-host visits.
    const storedIntent =
      readExamIntent((await searchParams).intent) ??
      readExamIntent((await cookies()).get(EXAM_INTENT_COOKIE)?.value);
    const intent = storedIntent?.examSlug === slug ? storedIntent : null;
    if (!user)
      return (
        <ExamPreparationFlow
          exam={exam}
          plans={plans}
          initialStep="plans"
          initialIntent={intent}
          appOrigin={mainAppOrigin((await headers()).get("host"))}
        />
      );
    const [enrollment, paymentConfig] = await Promise.all([
      getStudentExamEnrollment(user.id),
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
