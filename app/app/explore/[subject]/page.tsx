import { notFound } from "next/navigation";
import { SetAppShell } from "@/components/set-app-shell";
import { SubjectDetailClient } from "@/components/subject-detail-client";
import { requireOnboardedUser } from "@/lib/auth";
import { getStudentSubjectDetail } from "@/lib/data/student-subject";

export const dynamic = "force-dynamic";

export default async function SubjectDetailPage({
  params,
}: {
  params: Promise<{ subject: string }>;
}) {
  const { user } = await requireOnboardedUser();
  const { subject } = await params;
  const decodedSubject = decodeURIComponent(subject);

  if (!decodedSubject.trim()) notFound();

  const detail = await getStudentSubjectDetail(user.id, decodedSubject);
  if (!detail) notFound();

  return (
    <>
      <SetAppShell title={null} />
      <SubjectDetailClient detail={detail} />
    </>
  );
}
