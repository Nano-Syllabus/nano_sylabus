import { SetAppShell } from "@/components/set-app-shell";
import { StudentCoursesClient } from "@/components/student-courses-client";
import { requireOnboardedUser } from "@/lib/auth";
import { listStudentCourses } from "@/lib/student-courses";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const { user } = await requireOnboardedUser();
  const courses = await listStudentCourses(user.id);

  return (
    <>
      <SetAppShell title="Courses" />
      <StudentCoursesClient courses={courses} />
    </>
  );
}
