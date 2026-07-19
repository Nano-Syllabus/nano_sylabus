import { notFound } from "next/navigation";
import { SetAppShell } from "@/components/set-app-shell";
import { SubjectDetailClient } from "@/components/subject-detail-client";
import { requireOnboardedUser } from "@/lib/auth";
import { listSubjectSessions } from "@/lib/data/explorer";

export default async function SubjectDetailPage({
  params,
}: {
  params: Promise<{ subject: string }>;
}) {
  const { user } = await requireOnboardedUser();
  const { subject } = await params;
  const decodedSubject = decodeURIComponent(subject);

  if (!decodedSubject.trim()) notFound();

  const sessions = await listSubjectSessions(user.id, decodedSubject);

  return (
    <>
      <SetAppShell title={decodedSubject} />
      <SubjectDetailClient subject={decodedSubject} sessions={sessions} />
    </>
  );
}
