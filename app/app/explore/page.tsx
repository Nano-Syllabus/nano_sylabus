import { SetAppShell } from "@/components/set-app-shell";
import { SubjectExplorerClient } from "@/components/subject-explorer-client";
import { requireOnboardedUser } from "@/lib/auth";
import { listExplorerSubjects } from "@/lib/data/explorer";
import { listStudentCourses } from "@/lib/student-courses";

export default async function ExplorePage() {
  const { user, profile } = await requireOnboardedUser();
  const courses = await listStudentCourses(user.id);
  const courseSubjects = courses.flatMap((course) =>
    course.subjects.flatMap((subject) => [subject.slug, subject.name]),
  );
  const subjects = profile
    ? await listExplorerSubjects(user.id, profile, courseSubjects)
    : [];
  const courseGroups = courses.map((course) => ({
    slug: course.slug,
    name: course.name,
    subjects: course.subjects.map((subject) => ({
      slug: subject.slug,
      name: subject.name,
    })),
  }));

  return (
    <>
      <SetAppShell title="Subjects" />
      <SubjectExplorerClient subjects={subjects} courses={courseGroups} />
    </>
  );
}
