import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listStudentCourses } from "@/lib/student-courses";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const courses = await listStudentCourses(user.id);
    const subjects = courses.flatMap((course) =>
      course.subjects.map((subject) => ({
        courseId: course.id,
        name: subject.name,
        slug: subject.slug,
        namespaceSlug: subject.slug,
        folderPath: subject.folderPath,
      })),
    );

    return NextResponse.json({
      subjects,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load tenant subjects.",
      },
      { status: 500 },
    );
  }
}
