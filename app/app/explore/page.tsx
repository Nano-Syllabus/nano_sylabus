import { SetAppShell } from "@/components/set-app-shell";
import { SubjectExplorerClient } from "@/components/subject-explorer-client";
import { getSessionUser, requireOnboardedUser } from "@/lib/auth";
import { listExplorerSubjects } from "@/lib/data/explorer";
import {
  listCreatorPrivateSubjectAccess,
  listStudentCourseSubjects,
  listStudentCourses,
} from "@/lib/student-courses";

export default async function ExplorePage() {
  // Everything below except the explorer query needs only the user id, which the
  // session has without a database trip — so it starts now, alongside the
  // profile batch, rather than after it.
  const { user: sessionUser } = await getSessionUser();
  const userId = sessionUser?.id ?? (await requireOnboardedUser()).user.id;

  // The explorer only needs subject names to resolve its tenant subjects, and
  // that lookup is two cheap round trips. Kicking it off alongside the full
  // course cards lets the explorer query start while the heavier card fan-out
  // is still in flight, instead of waiting for it to finish first.
  const coursesPromise = listStudentCourses(userId);
  const courseSubjectPromise = listStudentCourseSubjects(userId);
  const privateSubjectPromise = listCreatorPrivateSubjectAccess(userId);
  const { user, profile } = await requireOnboardedUser();

  const subjectsPromise = profile
    ? Promise.all([courseSubjectPromise, privateSubjectPromise]).then(
        ([courseSubjects, privateSubjects]) =>
          listExplorerSubjects(
            user.id,
            profile,
            courseSubjects.map((subject) => ({
              name: subject.subjectName,
              slug: subject.subjectSlug,
              category: subject.courseCategory,
              board: subject.courseAuthority,
              grade: subject.courseLevel,
            })),
            privateSubjects.map((subject) => ({
              name: subject.subjectName,
              slug: subject.subjectSlug,
              private: true,
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
