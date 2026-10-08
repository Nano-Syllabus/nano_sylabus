import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getEnrollmentExam,
  getStudentExamEnrollment,
  selectExamFaculty,
} from "@/lib/data/exam-enrollment";
import { LandingSiteError } from "@/lib/data/landing-sites";

const bodySchema = z.object({ facultySlug: z.string().min(1).max(100) });

/**
 * A student moves to another faculty of the exam site they joined — the
 * header dropdown (user, 2026-10-08: "only tell to upgrade, don't lock faculty
 * switch"). Only within the same exam; their onboarding answers carry over.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await getVerifiedUser(supabase);
  if (!user) return NextResponse.json({ error: "Sign in to switch faculty." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a faculty." }, { status: 400 });

  try {
    const enrollment = await getStudentExamEnrollment(user.id);
    if (!enrollment)
      return NextResponse.json({ error: "Join an exam before switching faculty." }, { status: 409 });
    if (enrollment.facultySlug === parsed.data.facultySlug)
      return NextResponse.json({ facultySlug: enrollment.facultySlug });
    const exam = await getEnrollmentExam(enrollment.examSlug);
    const target = exam?.faculties.find((faculty) => faculty.slug === parsed.data.facultySlug);
    if (!target)
      return NextResponse.json(
        { error: `That faculty isn’t part of ${enrollment.examName}.` },
        { status: 400 },
      );
    const { data: saved } = await createSupabaseAdminClient()
      .from("student_exam_enrollments")
      .select("preparation_answers")
      .eq("user_id", user.id)
      .eq("exam_slug", enrollment.examSlug)
      .maybeSingle();
    await selectExamFaculty(
      user.id,
      enrollment.examSlug,
      target.id,
      saved?.preparation_answers ?? {},
      true,
    );
    try {
      revalidatePath("/app", "layout");
    } catch {
      /* the next navigation renders fresh anyway */
    }
    return NextResponse.json({ facultySlug: target.slug });
  } catch (error) {
    if (error instanceof LandingSiteError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[exam-faculty:switch]", error);
    return NextResponse.json({ error: "Could not switch faculty. Please retry." }, { status: 500 });
  }
}
