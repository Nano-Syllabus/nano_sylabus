import { NextResponse } from "next/server";
import { z } from "zod";
import { recordPracticeEvaluation } from "@/lib/data/student-mastery";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findTenantSubject, gradePracticeSession, listTenantSubjects } from "@/lib/tenant/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const requestSchema = z.object({
  subject: z.string().trim().min(1),
  answers: z
    .array(
      z.object({
        questionId: z.string().trim().min(1),
        answerText: z.string().default(""),
      }),
    )
    .min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { sessionId } = await params;
    const parsed = requestSchema.parse(await request.json());

    const subjects = await listTenantSubjects();
    const subject = findTenantSubject(subjects, parsed.subject);
    if (!subject) {
      return NextResponse.json({ error: "That subject is not available." }, { status: 404 });
    }

    const graded = await gradePracticeSession(sessionId, {
      answers: parsed.answers.map((answer) => ({
        question_id: answer.questionId,
        answer_text: answer.answerText,
      })),
    });

    // The tenant stores nothing, so the chapter breakdown only survives if we
    // write it here. A persistence failure must not swallow the marks the
    // student just earned.
    let saved = true;
    if (graded.evaluation) {
      try {
        await recordPracticeEvaluation({
          userId: user.id,
          subjectSlug: subject.slug,
          subjectName: subject.name,
          source: "practice",
          sessionId,
          totalScore: graded.total_score,
          totalMarks: graded.total_marks,
          evaluation: graded.evaluation,
        });
      } catch {
        saved = false;
      }
    }

    return NextResponse.json({
      results: graded.results,
      totalScore: graded.total_score,
      totalMarks: graded.total_marks,
      evaluation: graded.evaluation,
      progressSaved: saved,
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message || "Invalid grading request."
        : error instanceof Error
          ? error.message
          : "Could not grade this practice sitting.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
