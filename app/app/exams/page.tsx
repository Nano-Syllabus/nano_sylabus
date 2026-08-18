import { SetAppShell } from "@/components/set-app-shell";
import { StudentExamsClient } from "@/components/student-exams-client";
import { requireOnboardedUser } from "@/lib/auth";
import { findTenantSubjectForCourseSubject, listTenantSubjects } from "@/lib/tenant/client";
import { listStudentCourseSubjects } from "@/lib/student-courses";

export const dynamic = "force-dynamic";

export default async function ExamsPage() {
  const { user } = await requireOnboardedUser();
  const [tenantSubjects, courseSubjects] = await Promise.all([
    listTenantSubjects(),
    listStudentCourseSubjects(user.id),
  ]);
  const subjectsBySlug = new Map(
    courseSubjects.flatMap((courseSubject) => {
      const tenantSubject = findTenantSubjectForCourseSubject(tenantSubjects, {
        subjectSlug: courseSubject.subjectSlug,
        subjectName: courseSubject.subjectName,
        folderPath: courseSubject.folderPath,
      });
      return tenantSubject
        ? [
            [
              tenantSubject.slug,
              {
                name: tenantSubject.name,
                slug: tenantSubject.slug,
                practiceAvailable: tenantSubject.chunk_count > 0,
              },
            ] as const,
          ]
        : [];
    }),
  );
  const subjects = Array.from(subjectsBySlug.values());

  return (
    <>
      <SetAppShell title="Exams" />
      <StudentExamsClient subjects={subjects} fullName={user.fullName} />
    </>
  );
}
