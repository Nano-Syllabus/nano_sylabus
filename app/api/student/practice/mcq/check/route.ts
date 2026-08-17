import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkMcqItems, type McqCheckResult } from "@/lib/tenant/client";

export const dynamic = "force-dynamic";

const optionSchema = z.object({ key: z.string().max(20), text: z.string().trim().min(1).max(2000) });
const requestSchema = z.object({
  negativeMarks: z.number().min(0).default(0),
  items: z.array(z.object({
    questionId: z.string().trim().min(1),
    question: z.string().trim().max(5000).optional(),
    chapter: z.string().trim().max(500).optional(),
    marks: z.number().positive(),
    options: z.array(optionSchema).min(2).max(6).optional(),
    correct: z.string().trim().min(1).max(2000),
    selected: z.string().trim().max(2000).optional(),
    explanation: z.string().trim().max(5000).optional(),
  })).min(1).max(60),
});

function feedback(result: McqCheckResult) {
  const correct = result.correct_option || result.correct;
  const verdict = result.attempted === false
    ? "Unattempted."
    : result.is_correct || result.score >= result.marks ? "Correct." : "Incorrect.";
  return [verdict, correct ? `Correct answer: ${correct}.` : "", result.explanation || ""]
    .filter(Boolean).join(" ");
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = requestSchema.parse(await request.json());
    const checked = await checkMcqItems({
      negative_marks: parsed.negativeMarks,
      items: parsed.items.map((item) => ({
        question_id: item.questionId,
        question: item.question || undefined,
        chapter: item.chapter || undefined,
        marks: item.marks,
        options: item.options,
        correct: item.correct,
        selected: item.selected || undefined,
        explanation: item.explanation || undefined,
      })),
    });
    return NextResponse.json({
      results: checked.results.map((result) => ({ ...result, feedback: feedback(result) })),
      totalScore: checked.total_score,
      totalMarks: checked.total_marks,
      penalty: checked.penalty ?? 0,
      negativeMarks: checked.negative_marks ?? parsed.negativeMarks,
      correctCount: checked.correct_count ?? null,
      wrongCount: checked.wrong_count ?? null,
      unattemptedCount: checked.unattempted_count ?? null,
      evaluation: checked.evaluation ?? null,
    });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message || "Invalid MCQ items."
      : error instanceof Error ? error.message : "Could not check these MCQs.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
