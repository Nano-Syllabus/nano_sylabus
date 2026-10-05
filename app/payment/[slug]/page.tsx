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
import { getActiveManualPaymentConfig } from "@/lib/data/billing";

type PageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export default async function CoursePaymentPage({ params }: PageProps) {
  const { slug } = await params;
  const { user } = await getCurrentAuth();
  const paymentPath = `/payment/${encodeURIComponent(slug)}`;

  const exam = await getEnrollmentExam(slug);
  if (exam) {
    const plans = await getExamPlans(exam);
    const storedIntent = readExamIntent((await cookies()).get(EXAM_INTENT_COOKIE)?.value);
    const intent = storedIntent?.examSlug === slug ? storedIntent : null;
    if (!user)
      return (
        <ExamPreparationFlow exam={exam} plans={plans} initialStep={2} initialIntent={intent} />
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
