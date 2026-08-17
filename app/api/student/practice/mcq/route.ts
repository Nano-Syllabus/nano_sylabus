import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  findTenantSubjectForCourseSubject,
  generateMcqSet,
  listTenantSubjects,
} from "@/lib/tenant/client";
import { getStudentCourseSubjectAccess } from "@/lib/student-courses";
import { safeMcqSet } from "./safe-set";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const requestSchema = z.object({
  subject: z.string().trim().min(1),
  chapters: z.array(z.string().trim().min(1)).max(20).optional(),
  bands: z
    .array(
      z.object({
        marksEach: z.union([z.literal(1), z.literal(2)]),
        count: z.number().int().min(0).max(60),
      }),
    )
    .min(1)
    .max(2),
  perChapter: z.boolean().default(false),
  optionsPerQuestion: z.number().int().min(2).max(6).default(4),
  negativeMarks: z.number().min(0).default(0),
  instruction: z.string().trim().max(1000).optional(),
}).superRefine((value, context) => {
  const baseCount = value.bands.reduce((sum, band) => sum + band.count, 0);
  const multiplier = value.perChapter ? value.chapters?.length || 0 : 1;
  if (baseCount < 1) {
    context.addIssue({ code: "custom", path: ["bands"], message: "Add at least one MCQ." });
  }
  if (value.perChapter && multiplier < 1) {
    context.addIssue({
      code: "custom",
      path: ["chapters"],
      message: "Choose at least one chapter for per-chapter generation.",
    });
  }
  if (baseCount * multiplier > 60) {
    context.addIssue({
      code: "custom",
      path: ["bands"],
      message: "MCQ sets can contain at most 60 questions.",
    });
  }
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
    const access = await getStudentCourseSubjectAccess(user.id, parsed.subject);
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
        { error: "This subject does not have indexed MCQ content yet." },
        { status: 409 },
      );
    }

    const set = await generateMcqSet({
      subject: subject.slug,
      namespaces: [subject.namespace],
      chapters: parsed.chapters?.length ? parsed.chapters : undefined,
      bands: parsed.bands.map((band) => ({
        marks_each: band.marksEach,
        count: band.count,
      })),
      per_chapter: parsed.perChapter,
      options_per_question: parsed.optionsPerQuestion,
      negative_marks: parsed.negativeMarks,
      instruction: parsed.instruction || undefined,
    });

    return NextResponse.json({
      ...safeMcqSet(set),
      subject: { name: subject.name, slug: subject.slug },
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message || "Invalid MCQ request."
        : error instanceof Error
          ? error.message
          : "Could not generate this MCQ quiz.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
