import { notFound } from "next/navigation";
import { SetAppShell } from "@/components/set-app-shell";
import { SubjectDetailClient } from "@/components/subject-detail-client";
import { requireOnboardedUser } from "@/lib/auth";

export default async function SubjectDetailPage({
  params,
}: {
  params: Promise<{ subject: string }>;
}) {
  await requireOnboardedUser();
  const { subject } = await params;
  const decodedSubject = decodeURIComponent(subject);

  if (!decodedSubject.trim()) notFound();

  return (
    <>
      <SetAppShell title={null} />
      <SubjectDetailClient subject={decodedSubject} />
    </>
  );
}
