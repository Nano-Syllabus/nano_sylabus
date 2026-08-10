import { NextResponse } from "next/server";
import { z } from "zod";
import { recordPracticeEvaluation } from "@/lib/data/student-mastery";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findTenantSubject, gradeTeacherPaper, listTenantSubjects } from "@/lib/tenant/client";

const requestSchema = z.object({
  subject: z.string().trim().min(1).max(200).optional(),
  student_name: z.string().trim().max(200).optional(),
  instruction: z.string().trim().max(2_000).optional(),
  answers: z
    .array(
      z.object({
        question_id: z.string().trim().min(1).max(200),
        answer_text: z.string().max(20_000),
      }),
    )
    .min(1)
    .max(16),
});

export async function POST(request: Request, { params }: { params: Promise<{ setId: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { setId } = await params;
    const payload = requestSchema.parse(await request.json());
    const { subject: subjectName, ...gradePayload } = payload;
    const grade = await gradeTeacherPaper(setId, gradePayload);
    if (grade.graded === false) {
      return NextResponse.json(
        { error: "The strict examiner could not grade this paper. Please try again." },
        { status: 503 },
      );
    }

    let progressSaved = false;
    if (subjectName && grade.evaluation) {
      try {
        const subjects = await listTenantSubjects();
        const subject = findTenantSubject(subjects, subjectName);
        if (subject) {
          await recordPracticeEvaluation({
            userId: user.id,
            subjectSlug: subject.slug,
            subjectName: subject.name,
            source: "practice",
            sessionId: setId,
            totalScore: grade.total_score,
            totalMarks: grade.total_marks,
            evaluation: grade.evaluation,
          });
          progressSaved = true;
        }
      } catch (error) {
        console.error("[student full practice typed persistence]", error);
      }
    }

    return NextResponse.json({ grade, progressSaved });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message || "Invalid grading request."
        : error instanceof Error
          ? error.message
          : "Failed to grade exam answers.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
