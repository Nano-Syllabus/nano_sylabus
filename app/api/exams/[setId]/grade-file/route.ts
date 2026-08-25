import { NextResponse } from "next/server";
import { recordPracticeEvaluation, savePracticeAnswerSheet } from "@/lib/data/student-mastery";
import { createPracticeAttemptHistory, studentExamHistorySchema } from "@/lib/practice-history";
import { getStudentCourseSubjectAccess } from "@/lib/student-courses";
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
    const studentName = String(formData.get("student_name") ?? "");
    const examValue = String(formData.get("exam") ?? "").trim();
    const exam = examValue ? studentExamHistorySchema.parse(JSON.parse(examValue)) : null;

    const access = subjectName
      ? await getStudentCourseSubjectAccess(user.id, subjectName)
      : null;
    if (subjectName && !access) {
      return NextResponse.json(
        { error: "Enroll in a course containing this subject first." },
        { status: 403 },
      );
    }

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

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const grade = await gradeTeacherPaperFile(setId, {
      studentName,
      instruction: String(formData.get("instruction") ?? ""),
      file: {
        name: file.name || "answer-sheet",
        mimeType: file.type || "application/octet-stream",
        buffer: fileBuffer,
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
          const attemptId = await recordPracticeEvaluation({
            userId: user.id,
            courseId: access?.accessKind === "owner-private" ? null : access?.courseId,
            subjectSlug: subject.slug,
            subjectName: subject.name,
            source: "practice",
            sessionId: setId,
            totalScore: grade.total_score,
            totalMarks: grade.total_marks,
            evaluation: grade.evaluation,
            history: exam
              ? createPracticeAttemptHistory({
                  exam,
                  results: grade.results,
                  studentName,
                })
              : undefined,
          });
          await savePracticeAnswerSheet({
            attemptId,
            userId: user.id,
            fileName: file.name || "answer-sheet",
            mimeType: file.type,
            buffer: fileBuffer,
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
