import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listCreatorPrivateSubjectAccess, listStudentCourses } from "@/lib/student-courses";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [courses, privateSubjects] = await Promise.all([
      listStudentCourses(user.id),
      listCreatorPrivateSubjectAccess(user.id),
    ]);
    const subjects = [
      ...privateSubjects.map((subject) => ({
        courseId: subject.courseId,
        name: subject.subjectName,
        slug: subject.subjectSlug,
        namespaceSlug: subject.subjectSlug,
        folderPath: subject.folderPath,
        private: true,
      })),
      ...courses.flatMap((course) =>
        course.subjects.map((subject) => ({
          courseId: course.id,
          name: subject.name,
          slug: subject.slug,
          namespaceSlug: subject.slug,
          folderPath: subject.folderPath,
        })),
      ),
    ];

    return NextResponse.json({
      subjects,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load tenant subjects.",
      },
      { status: 500 },
    );
  }
}
