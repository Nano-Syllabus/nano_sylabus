import { notFound } from "next/navigation";
import { SetAppShell } from "@/components/set-app-shell";
import { SubjectDetailClient } from "@/components/subject-detail-client";
import { requireOnboardedUser } from "@/lib/auth";
import { getStudentSubjectDetail } from "@/lib/data/student-subject";
import { listStudentCourses } from "@/lib/student-courses";

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

  const courses = await listStudentCourses(user.id);
  const canAccess = courses.some((course) =>
    course.subjects.some(
      (item) =>
        item.slug.toLowerCase() === decodedSubject.toLowerCase() ||
        item.name.toLowerCase() === decodedSubject.toLowerCase(),
    ),
  );
  if (!canAccess) notFound();

  const detail = await getStudentSubjectDetail(user.id, decodedSubject);
  if (!detail) notFound();

  return (
    <>
      <SetAppShell title={null} />
      <SubjectDetailClient detail={detail} />
    </>
  );
}
