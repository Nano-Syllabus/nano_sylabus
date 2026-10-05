import { notFound, redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { mainAppOrigin } from "@/lib/landing-site-host";
import { ExamPreparationFlow } from "@/components/exam-enrollment-flow";
import { getEnrollmentExam, getExamPlans } from "@/lib/data/exam-enrollment";
import { EXAM_INTENT_COOKIE, readExamIntent } from "@/lib/exam-enrollment";
import { getCurrentAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ExamPreparationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ intent?: string }>;
}) {
  const { slug } = await params;
  const storedIntent =
    readExamIntent((await searchParams).intent) ??
    readExamIntent((await cookies()).get(EXAM_INTENT_COOKIE)?.value);
  const intent = storedIntent?.examSlug === slug ? storedIntent : null;
  const appOrigin = mainAppOrigin((await headers()).get("host"));
  // Auth cookies belong to the main site. Check the session there rather than
  // treating a signed-in student visiting an exam subdomain as a guest.
  if (appOrigin) {
    const query = intent ? `?intent=${encodeURIComponent(JSON.stringify(intent))}` : "";
    redirect(`${appOrigin}/prepare/${encodeURIComponent(slug)}${query}`);
  }
  const exam = await getEnrollmentExam(slug);
  if (!exam) notFound();
  const { user } = await getCurrentAuth();
  if (user) redirect("/app/today");
  return (
    <ExamPreparationFlow exam={exam} plans={await getExamPlans(exam)} initialIntent={intent} />
  );
}
