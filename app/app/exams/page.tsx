import { SetAppShell } from "@/components/set-app-shell";
import { StudentExamsClient } from "@/components/student-exams-client";
import { requireOnboardedUser } from "@/lib/auth";
import { findTenantSubject, listTenantSubjects } from "@/lib/tenant/client";
import { listStudentCourses } from "@/lib/student-courses";

export const dynamic = "force-dynamic";

export default async function ExamsPage() {
  const { user } = await requireOnboardedUser();
  const [tenantSubjects, courses] = await Promise.all([
    listTenantSubjects(),
    listStudentCourses(user.id),
  ]);
  const subjects = Array.from(
    new Set(
      courses.flatMap((course) =>
        course.subjects.flatMap((courseSubject) => {
          const tenantSubject = findTenantSubject(tenantSubjects, courseSubject.slug);
          return tenantSubject ? [tenantSubject.name] : [];
        }),
      ),
    ),
  );
  const subjectKeys = new Set(subjects.map((subject) => subject.toLowerCase()));
  const unavailableSubjects = tenantSubjects
    .filter((subject) => subjectKeys.has(subject.name.toLowerCase()) && subject.chunk_count <= 0)
    .map((subject) => subject.name);

  return (
    <>
      <SetAppShell title="Exams" />
      <StudentExamsClient
        subjects={subjects}
        unavailableSubjects={unavailableSubjects}
        fullName={user.fullName}
      />
    </>
  );
}
