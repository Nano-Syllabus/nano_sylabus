import { SetAppShell } from "@/components/set-app-shell";
import { SubjectExplorerClient } from "@/components/subject-explorer-client";
import { requireOnboardedUser } from "@/lib/auth";
import { listExplorerSubjects } from "@/lib/data/explorer";
import { listCreatorPrivateSubjectAccess, listStudentCourses } from "@/lib/student-courses";

export default async function ExplorePage() {
  const { user, profile } = await requireOnboardedUser();
  const [courses, privateSubjects] = await Promise.all([
    listStudentCourses(user.id),
    listCreatorPrivateSubjectAccess(user.id),
  ]);
  const courseSubjects = courses.flatMap((course) =>
    course.subjects.flatMap((subject) => [subject.slug, subject.name]),
  );
  const subjects = profile
    ? await listExplorerSubjects(
        user.id,
        profile,
        courseSubjects,
        privateSubjects.map((subject) => ({
          name: subject.subjectName,
          slug: subject.subjectSlug,
        })),
      )
    : [];
  return (
    <>
      <SetAppShell title="My courses" />
      <SubjectExplorerClient subjects={subjects} courses={courses} />
    </>
  );
}
