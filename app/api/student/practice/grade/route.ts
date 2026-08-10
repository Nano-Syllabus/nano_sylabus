import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { gradePracticeItems } from "@/lib/tenant/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const requestSchema = z.object({
  question: z.string().trim().min(3).max(10_000),
  chapter: z.string().trim().max(200).optional(),
  marks: z.number().int().min(1).max(100),
  referenceAnswer: z.string().trim().max(20_000).optional(),
  studentAnswer: z.string().trim().min(1).max(20_000),
});

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = requestSchema.parse(await request.json());
    const grade = await gradePracticeItems({
      items: [
        {
          question_id: "answer-checker",
          question: payload.question,
          chapter: payload.chapter || undefined,
          marks: payload.marks,
          reference_answer: payload.referenceAnswer || undefined,
          student_answer: payload.studentAnswer,
        },
      ],
    });

    const result = grade.results?.[0];
    if (!grade.graded || !result) {
      return NextResponse.json(
        {
          error: "The strict examiner could not grade this answer. Please try again.",
          graded: false,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      result,
      totalScore: grade.total_score,
      totalMarks: grade.total_marks,
      graded: grade.graded,
      evaluation: grade.evaluation ?? null,
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message || "Check the question and answer fields."
        : error instanceof Error
          ? error.message
          : "Could not grade this answer.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
