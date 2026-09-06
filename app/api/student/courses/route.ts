import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listStudentCourses } from "@/lib/student-courses";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const courses = await listStudentCourses(user.id);
    return NextResponse.json({ courses });
  } catch {
    return NextResponse.json({ error: "Could not load your courses." }, { status: 502 });
  }
}

