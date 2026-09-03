import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { askTeacherSubject, getTeacherSubjects, TeacherApiError } from "@/lib/teacher-app/client";
import { syncTeacherSyllabusToCommunities } from "@/lib/data/community-subjects";
import { revalidatePath } from "next/cache";

type Context = { params: Promise<{ slug: string }> };

export const maxDuration = 180;

const topicSchema = z.object({ name: z.string().trim().min(1).max(200) });
const chapterSchema = z.object({
  title: z.string().trim().min(1).max(200),
  topics: z.array(topicSchema).max(100),
});
const structureSchema = z.array(chapterSchema).min(1).max(100);

async function publishSyllabus(userId: string, teacherId: string, slug: string) {
  try {
    const sync = await syncTeacherSyllabusToCommunities(userId, teacherId, slug);
    if (sync.subjectsSynced > 0 && sync.topicCount === 0) {
      throw new Error("No executable challenge topics were returned.");
    }
    revalidatePath("/teachers");
    revalidatePath("/app", "layout");
    return sync;
  } catch {
    throw new Error(
      "The syllabus was saved, but its community topics could not be synced. Save the structure again to retry.",
    );
  }
}

async function teacherAndSubject(context: Context) {
  const teacher = await getTeacherProfile();
  if (!teacher) return { teacher: null, subject: null, slug: "" };
  const { slug } = await context.params;
  const subjects = await getTeacherSubjects(teacher.collection_sk);
  const subject = subjects.subjects.find((item) => item.slug === slug);
  return { teacher, subject, slug };
}

function parseStructure(answer: string) {
  const fenced = answer.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced || answer.slice(answer.indexOf("["), answer.lastIndexOf("]") + 1);
  if (!raw) return null;
  try {
    const parsed = structureSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function GET(_request: Request, context: Context) {
  try {
    const { teacher, subject, slug } = await teacherAndSubject(context);
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!subject) return NextResponse.json({ error: "Subject not found." }, { status: 404 });
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("teacher_subject_syllabi")
      .select("structure,updated_at")
      .eq("teacher_id", teacher.id)
      .eq("subject_slug", slug)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({
      structure: data?.structure || [],
      updatedAt: data?.updated_at || null,
    });
  } catch {
    return NextResponse.json({ error: "Could not load the editable syllabus." }, { status: 502 });
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const { teacher, subject, slug } = await teacherAndSubject(context);
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!subject) return NextResponse.json({ error: "Subject not found." }, { status: 404 });
    const parsed = structureSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid syllabus structure." },
        { status: 400 },
      );
    }
    const admin = createSupabaseAdminClient();
    const updatedAt = new Date().toISOString();
    const { error } = await admin.from("teacher_subject_syllabi").upsert(
      {
        teacher_id: teacher.id,
        subject_slug: slug,
        structure: parsed.data,
        updated_at: updatedAt,
      },
      { onConflict: "teacher_id,subject_slug" },
    );
    if (error) throw error;
    const sync = await publishSyllabus(teacher.user_id, teacher.id, slug);
    return NextResponse.json({ structure: parsed.data, updatedAt, sync });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message.startsWith("The syllabus was saved")
            ? error.message
            : "Could not save the syllabus structure.",
      },
      { status: 502 },
    );
  }
}

export async function POST(_request: Request, context: Context) {
  try {
    const { teacher, subject, slug } = await teacherAndSubject(context);
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!subject) return NextResponse.json({ error: "Subject not found." }, { status: 404 });
    const result = await askTeacherSubject(
      teacher.collection_sk,
      typeof subject.name === "string" && subject.name.trim() ? subject.name.trim() : slug,
      'Read the indexed syllabus for this subject and extract its units or chapters and topics. Return ONLY valid JSON in this exact shape: [{"title":"Unit title","topics":[{"name":"Topic"}]}]. Do not add markdown or commentary. Preserve the syllabus order and wording. If no syllabus structure is present, return [].',
      15,
      "Use the indexed Syllabus shelf as the source. Return only the requested JSON array and no markdown.",
    );
    const answer = typeof result.answer === "string" ? result.answer : "";
    const structure = parseStructure(answer);
    if (!structure?.length) {
      return NextResponse.json(
        { error: "No structured units were found. Make sure the syllabus file is indexed." },
        { status: 422 },
      );
    }
    const admin = createSupabaseAdminClient();
    const updatedAt = new Date().toISOString();
    const { error } = await admin
      .from("teacher_subject_syllabi")
      .upsert(
        { teacher_id: teacher.id, subject_slug: slug, structure, updated_at: updatedAt },
        { onConflict: "teacher_id,subject_slug" },
      );
    if (error) throw error;
    const sync = await publishSyllabus(teacher.user_id, teacher.id, slug);
    return NextResponse.json({ structure, updatedAt, sync });
  } catch (error) {
    const apiError = error instanceof TeacherApiError ? error : null;
    const status = apiError?.status === 404 ? 404 : apiError?.status === 408 ? 504 : 502;
    const message =
      error instanceof Error && error.message.startsWith("The syllabus was saved")
        ? error.message
        : apiError?.status === 404
          ? "Index a syllabus file before extracting units."
          : apiError?.message
            ? `Could not extract the syllabus structure: ${apiError.message}`
            : "Could not extract the syllabus structure.";
    return NextResponse.json({ error: message }, { status });
  }
}
