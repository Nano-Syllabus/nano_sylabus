import { notFound } from "next/navigation";
import { SetAppShell } from "@/components/set-app-shell";
import { SubjectDetailClient } from "@/components/subject-detail-client";
import { requireOnboardedUser } from "@/lib/auth";
import { getStudentSubjectDetail } from "@/lib/data/student-subject";
import {
  listCreatorPrivateSubjectAccess,
  listStudentCourses,
} from "@/lib/student-courses";

export const dynamic = "force-dynamic";

function subjectUrlKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default async function SubjectDetailPage({
  params,
}: {
  params: Promise<{ subject: string }>;
}) {
  const { user } = await requireOnboardedUser();
  const { subject } = await params;
  const decodedSubject = decodeURIComponent(subject);

  if (!decodedSubject.trim()) notFound();

  const [courses, privateSubjects] = await Promise.all([
    listStudentCourses(user.id),
    listCreatorPrivateSubjectAccess(user.id),
  ]);
  const decodedKey = subjectUrlKey(decodedSubject);
  const subjectMatches = (item: { slug: string; name: string }) => {
      const slug = item.slug.trim();
      const name = item.name.trim();
      return (
        slug.toLowerCase() === decodedSubject.toLowerCase() ||
        name.toLowerCase() === decodedSubject.toLowerCase() ||
        subjectUrlKey(slug) === decodedKey ||
        subjectUrlKey(name) === decodedKey
      );
  };
  const accessibleCourse = courses.find((course) => course.subjects.some(subjectMatches));
  const accessibleSubject = accessibleCourse?.subjects.find(subjectMatches);
  const privateSubject = privateSubjects.find((subject) =>
    subjectMatches({ slug: subject.subjectSlug, name: subject.subjectName }),
  );
  if (!accessibleSubject && !privateSubject) notFound();

  const subjectSlug = accessibleSubject?.slug || privateSubject?.subjectSlug;
  if (!subjectSlug) notFound();

  const detail = await getStudentSubjectDetail(user.id, subjectSlug, privateSubject);
  if (!detail) notFound();

  return (
    <>
      <SetAppShell title={null} />
      <SubjectDetailClient
        detail={detail}
        courseName={accessibleCourse?.name || "Private subject"}
        isPrivate={Boolean(privateSubject && !accessibleCourse)}
        readinessTarget={
          accessibleCourse && accessibleCourse.passPercentage > 0
            ? accessibleCourse.passPercentage
            : null
        }
      />
    </>
  );
}
