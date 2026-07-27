import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { gradeTeacherPaper } from "@/lib/tenant/client";

const requestSchema = z.object({
  student_name: z.string().optional(),
  instruction: z.string().optional(),
  answers: z
    .array(
      z.object({
        question_id: z.string().min(1),
        answer_text: z.string(),
      }),
    )
    .min(1),
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
    const grade = await gradeTeacherPaper(setId, payload);
    return NextResponse.json({ grade });
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
