import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { ExamPreparationFlow } from "@/components/exam-enrollment-flow";
import { getEnrollmentExam, getExamPlans } from "@/lib/data/exam-enrollment";
import { EXAM_INTENT_COOKIE, readExamIntent } from "@/lib/exam-enrollment";

export const dynamic = "force-dynamic";

export default async function ExamPreparationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { slug } = await params;
  const exam = await getEnrollmentExam(slug);
  if (!exam) notFound();
  const intent = readExamIntent((await cookies()).get(EXAM_INTENT_COOKIE)?.value);
  return (
    <ExamPreparationFlow
      exam={exam}
      plans={await getExamPlans(exam)}
      initialStep={(await searchParams).step === "faculties" ? 1 : 0}
      initialIntent={intent?.examSlug === slug ? intent : null}
    />
  );
}
