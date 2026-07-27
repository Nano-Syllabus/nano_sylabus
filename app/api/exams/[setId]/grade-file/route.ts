import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { gradeTeacherPaperFile } from "@/lib/tenant/client";

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
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Answer sheet file is required." }, { status: 400 });
    }

    const grade = await gradeTeacherPaperFile(setId, {
      studentName: String(formData.get("student_name") ?? ""),
      instruction: String(formData.get("instruction") ?? ""),
      file: {
        name: file.name || "answer-sheet",
        mimeType: file.type || "application/octet-stream",
        buffer: Buffer.from(await file.arrayBuffer()),
      },
    });

    return NextResponse.json({ grade });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to grade answer sheet.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
