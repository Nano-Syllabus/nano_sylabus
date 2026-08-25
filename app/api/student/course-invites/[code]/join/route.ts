import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enrollStudentInCourseByInviteCode, StudentCourseError } from "@/lib/student-courses";

type RouteContext = { params: Promise<{ code: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { code } = await context.params;
    const course = await enrollStudentInCourseByInviteCode(user.id, code);
    return NextResponse.json({ course });
  } catch (error) {
    if (error instanceof StudentCourseError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Could not join this course." }, { status: 502 });
  }
}
