import { NextResponse } from "next/server";
import { recordPracticeEvaluation } from "@/lib/data/student-mastery";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findTenantSubject, gradeTeacherPaperFile, listTenantSubjects } from "@/lib/tenant/client";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);

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
    const subjectName = String(formData.get("subject") ?? "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Answer sheet file is required." }, { status: 400 });
    }
    if (!ALLOWED_FILE_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Use a PDF, JPG or PNG answer sheet." }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "Answer sheets must be 15 MB or smaller." },
        { status: 400 },
      );
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
    if (grade.graded === false) {
      return NextResponse.json(
        { error: "The strict examiner could not grade this answer sheet. Please try again." },
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
        console.error("[student full practice file persistence]", error);
      }
    }

    return NextResponse.json({ grade, progressSaved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to grade answer sheet.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
