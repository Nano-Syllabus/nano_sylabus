import { SetAppShell } from "@/components/set-app-shell";
import { SubjectExplorerClient } from "@/components/subject-explorer-client";
import { requireOnboardedUser } from "@/lib/auth";
import { listExplorerSubjects } from "@/lib/data/explorer";
import {
  listCreatorPrivateSubjectAccess,
  listStudentCourseSubjects,
  listStudentCourses,
} from "@/lib/student-courses";

export default async function ExplorePage() {
  const { user, profile } = await requireOnboardedUser();

  // The explorer only needs subject names to resolve its tenant subjects, and
  // that lookup is two cheap round trips. Kicking it off alongside the full
  // course cards lets the explorer query start while the heavier card fan-out
  // is still in flight, instead of waiting for it to finish first.
  const coursesPromise = listStudentCourses(user.id);
  const courseSubjectPromise = listStudentCourseSubjects(user.id);
  const privateSubjectPromise = listCreatorPrivateSubjectAccess(user.id);

  const subjectsPromise = profile
    ? Promise.all([courseSubjectPromise, privateSubjectPromise]).then(
        ([courseSubjects, privateSubjects]) =>
          listExplorerSubjects(
            user.id,
            profile,
            courseSubjects.flatMap((subject) => [subject.subjectSlug, subject.subjectName]),
            privateSubjects.map((subject) => ({
              name: subject.subjectName,
              slug: subject.subjectSlug,
            })),
          ),
      )
    : Promise.resolve([]);

  const [courses, subjects] = await Promise.all([coursesPromise, subjectsPromise]);
  return (
    <>
      <SetAppShell title="My courses" />
      <SubjectExplorerClient subjects={subjects} courses={courses} />
    </>
  );
}
