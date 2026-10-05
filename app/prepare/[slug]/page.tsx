import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import { mainAppOrigin } from "@/lib/landing-site-host";
import { ExamPreparationFlow } from "@/components/exam-enrollment-flow";
import { getEnrollmentExam, getExamPlans } from "@/lib/data/exam-enrollment";
import { EXAM_INTENT_COOKIE, readExamIntent } from "@/lib/exam-enrollment";

export const dynamic = "force-dynamic";

export default async function ExamPreparationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const exam = await getEnrollmentExam(slug);
  if (!exam) notFound();
  const intent = readExamIntent((await cookies()).get(EXAM_INTENT_COOKIE)?.value);
  return (
    <ExamPreparationFlow
      exam={exam}
      plans={await getExamPlans(exam)}
      initialIntent={intent?.examSlug === slug ? intent : null}
      appOrigin={mainAppOrigin((await headers()).get("host"))}
    />
  );
}
