import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  enrollStudentInCourse,
  leaveStudentCourse,
  StudentCourseError,
} from "@/lib/student-courses";

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { slug } = await context.params;
    const course = await enrollStudentInCourse(user.id, slug);
    return NextResponse.json({ course });
  } catch (error) {
    if (error instanceof StudentCourseError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Could not enroll in this course." }, { status: 502 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { slug } = await context.params;
    const course = await leaveStudentCourse(user.id, slug);
    return NextResponse.json({ course });
  } catch (error) {
    if (error instanceof StudentCourseError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Could not leave this course." }, { status: 502 });
  }
}
