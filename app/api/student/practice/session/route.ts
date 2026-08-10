import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findTenantSubject, listTenantSubjects, startPracticeSession } from "@/lib/tenant/client";
import { studentHasCourseSubjectAccess } from "@/lib/student-courses";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const requestSchema = z.object({
  subject: z.string().trim().min(1),
  topics: z.array(z.string().trim().min(1)).max(20).optional(),
  totalMarks: z.number().int().min(5).max(100).optional(),
  maxQuestions: z.number().int().min(1).max(20).optional(),
});

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = requestSchema.parse(await request.json());

    const subjects = await listTenantSubjects();
    const subject = findTenantSubject(subjects, parsed.subject);
    if (!subject) {
      return NextResponse.json({ error: "That subject is not available." }, { status: 404 });
    }
    if (!(await studentHasCourseSubjectAccess(user.id, subject.slug))) {
      return NextResponse.json(
        { error: "Enroll in a course containing this subject first." },
        { status: 403 },
      );
    }
    if (subject.chunk_count <= 0) {
      return NextResponse.json(
        { error: "This subject does not have indexed practice content yet." },
        { status: 409 },
      );
    }

    const session = await startPracticeSession({
      subject: subject.slug,
      namespaces: [subject.namespace],
      topics: parsed.topics?.length ? parsed.topics : undefined,
      total_marks: parsed.totalMarks,
      max_questions: parsed.maxQuestions,
    });

    return NextResponse.json({
      sessionId: session.session_id,
      subject: { name: subject.name, slug: subject.slug },
      // Reference answers are never returned by the session endpoint, so the
      // questions can go straight to the client.
      questions: session.questions,
      totalMarks: session.total_marks,
      expiresAt: session.expires_at,
      plan: session.plan,
      warning: session.warning ?? null,
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message || "Invalid practice request."
        : error instanceof Error
          ? error.message
          : "Could not start practice.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
