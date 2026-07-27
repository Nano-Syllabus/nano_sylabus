import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateTeacherPaper } from "@/lib/tenant/client";

const bandSchema = z.object({
  label: z.string().min(1),
  question_type: z.string().min(1),
  count: z.number().int().min(1).max(50),
  marks_each: z.number().min(1).max(100),
});

const requestSchema = z.object({
  namespaces: z.array(z.string().min(1)).min(1),
  subject: z.string().min(1),
  bands: z.array(bandSchema).min(1),
  title: z.string().optional(),
  instruction: z.string().optional(),
  university: z.string().optional(),
  pass_marks: z.number().min(0).optional(),
});

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = requestSchema.parse(await request.json());
    const paper = await generateTeacherPaper(payload);
    return NextResponse.json({ paper });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message || "Invalid exam generation request."
        : error instanceof Error
          ? error.message
          : "Failed to generate exam paper.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
