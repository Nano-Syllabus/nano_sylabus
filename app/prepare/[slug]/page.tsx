import { notFound, redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { ExamPreparationFlow } from "@/components/exam-enrollment-flow";
import { getCurrentAuth } from "@/lib/auth";
import { getEnrollmentExam, getExamPlans } from "@/lib/data/exam-enrollment";
import { hasJoinedFaculty } from "@/lib/data/faculty-lock";
import { EXAM_INTENT_COOKIE, readExamIntent } from "@/lib/exam-enrollment";
import { mainAppOrigin } from "@/lib/landing-site-host";

export const dynamic = "force-dynamic";

/**
 * "Continue learning" on an exam's site. A new student gets the onboarding:
 * questions → supported faculties → plans → sign in → payment QR. A student who
 * already joined a faculty never sees it again and goes straight to the app.
 *
 * Sign-in lives on the main domain, and a subdomain never sees that session, so
 * a subdomain visit is handed to the main domain, which can tell who is who.
 */
export default async function ExamOnboardingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const appOrigin = mainAppOrigin((await headers()).get("host"));
  if (appOrigin) redirect(`${appOrigin}/prepare/${encodeURIComponent(slug)}`);

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
