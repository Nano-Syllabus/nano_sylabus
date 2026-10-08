import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ExamPreparationFlow } from "@/components/exam-enrollment-flow";
import { getCurrentAuth } from "@/lib/auth";
import { getEnrollmentExam, getExamPlans } from "@/lib/data/exam-enrollment";
import { hasJoinedFaculty } from "@/lib/data/faculty-lock";
import { EXAM_INTENT_COOKIE, readExamIntent } from "@/lib/exam-enrollment";

export const dynamic = "force-dynamic";

/**
 * "Continue learning" on an exam's site. A new student gets the onboarding:
 * questions → supported faculties → plans → sign in → payment QR. A student who
 * already joined a faculty never sees it again and goes straight to the app.
 *
 * It runs on the subdomain itself: each site has its own sign-in and dashboard
 * (user, 2026-10-08).
 */
export default async function ExamOnboardingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const exam = await getEnrollmentExam(slug);
  if (!exam) notFound();

  const { user } = await getCurrentAuth();
  if (user && (await hasJoinedFaculty(user.id))) redirect("/app/challenges");

  const intent = readExamIntent((await cookies()).get(EXAM_INTENT_COOKIE)?.value);
  return (
    <ExamPreparationFlow
      exam={exam}
      plans={await getExamPlans(exam)}
      initialIntent={intent?.examSlug === slug ? intent : null}
      signedIn={Boolean(user)}
    />
  );
}
