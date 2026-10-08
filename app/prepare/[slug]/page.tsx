import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ExamPreparationFlow } from "@/components/exam-enrollment-flow";
import { getCurrentAuth } from "@/lib/auth";
import Link from "next/link";
import { getEnrollmentExam, getExamPlans } from "@/lib/data/exam-enrollment";
import { getPublishedLandingSite } from "@/lib/data/landing-sites";
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
  if (!exam) {
    // A live site whose faculties aren't switched on yet: say so here rather
    // than 404 or send people to another site's Browse page.
    const site = await getPublishedLandingSite(slug);
    if (!site) notFound();
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Faculties are almost ready</h1>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          {site.name} is still setting up its faculties. Please check back soon.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Back to {site.name}
        </Link>
      </main>
    );
  }

  const { user } = await getCurrentAuth();
  if (user && (await hasJoinedFaculty(user.id, slug))) redirect("/app/challenges");

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
