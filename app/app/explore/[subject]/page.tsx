import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
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
    <AppShell user={user} title={decodedSubject}>
      <SubjectDetailClient subject={decodedSubject} sessions={sessions} />
    </AppShell>
  );
}
