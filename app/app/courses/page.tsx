import { SetAppShell } from "@/components/set-app-shell";
import { StudentCoursesClient } from "@/components/student-courses-client";
import { requireOnboardedUser } from "@/lib/auth";
import { listPublishedCourses, listStudentCourses } from "@/lib/student-courses";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const { user } = await requireOnboardedUser();
  const [courses, publishedCourses] = await Promise.all([
    listStudentCourses(user.id),
    listPublishedCourses(),
  ]);
  const enrolledCourseIds = new Set(courses.map((course) => course.id));
  const availableCourses = publishedCourses.filter(
    (course) => !enrolledCourseIds.has(course.id),
  );

  return (
    <>
      <SetAppShell title="Courses" />
      <StudentCoursesClient courses={courses} availableCourses={availableCourses} />
    </>
  );
}
