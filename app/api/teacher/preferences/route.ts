import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  fullName: z.string().trim().min(1).max(120),
  language: z.enum(["EN", "RN"]),
  answerStyle: z.enum(["concise", "exam_focused"]),
});

export async function PATCH(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid name and preferences." }, { status: 400 });
    const admin = createSupabaseAdminClient();
    const [{ error: authError }, { error: profileError }] = await Promise.all([
      admin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...user.user_metadata, full_name: parsed.data.fullName, teacher_language: parsed.data.language, teacher_answer_style: parsed.data.answerStyle },
      }),
      admin.from("student_profiles").update({ full_name: parsed.data.fullName, language_pref: parsed.data.language }).eq("user_id", user.id),
    ]);
    if (authError || profileError) throw authError || profileError;
    return NextResponse.json({ preferences: parsed.data });
  } catch {
    return NextResponse.json({ error: "Could not save teacher preferences." }, { status: 502 });
  }
}
