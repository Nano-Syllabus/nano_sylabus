import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  findTenantSubjectForCourseSubject,
  generateTeacherPaper,
  listTenantSubjects,
} from "@/lib/tenant/client";
import { getStudentCourseSubjectAccess } from "@/lib/student-courses";

const bandSchema = z.object({
  label: z.string().trim().min(1).max(80),
  question_type: z.string().trim().min(1).max(80),
  count: z.number().int().min(1).max(10),
  marks_each: z.number().min(1).max(25),
});

const requestSchema = z
  .object({
    namespaces: z.array(z.string().min(1)).optional(),
    subject: z.string().trim().min(1).max(200),
    bands: z.array(bandSchema).min(1).max(5),
    title: z.string().trim().max(200).optional(),
    instruction: z.string().trim().max(2_000).optional(),
    university: z.string().trim().max(200).optional(),
    pass_marks: z.number().min(0).max(100).optional(),
  })
  .refine((payload) => payload.bands.reduce((sum, band) => sum + band.count, 0) <= 16, {
    message: "A student paper can contain at most 16 questions.",
    path: ["bands"],
  })
  .refine(
    (payload) => payload.bands.reduce((sum, band) => sum + band.count * band.marks_each, 0) <= 100,
    { message: "A student paper can be worth at most 100 marks.", path: ["bands"] },
  );

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
    const subjects = await listTenantSubjects();
    const access = await getStudentCourseSubjectAccess(user.id, payload.subject);
    if (!access) {
      return NextResponse.json(
        { error: "Enroll in a course containing this subject first." },
        { status: 403 },
      );
    }
    const subject = findTenantSubjectForCourseSubject(subjects, access);
    if (!subject) {
      return NextResponse.json({ error: "That course subject is not available." }, { status: 404 });
    }
    if (subject.chunk_count <= 0) {
      return NextResponse.json(
        { error: "This subject does not have indexed material for a paper yet." },
        { status: 409 },
      );
    }

    const paper = await generateTeacherPaper({
      ...payload,
      subject: subject.slug,
      namespaces: [subject.namespace],
    });
    return NextResponse.json({
      paper: {
        ...paper,
        questions: paper.questions.map(
          ({ reference_answer: _referenceAnswer, ...question }) => question,
        ),
      },
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message || "Invalid exam generation request."
        : error instanceof Error
          ? error.message
          : "Failed to generate exam paper.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
