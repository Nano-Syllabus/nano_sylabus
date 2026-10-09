import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceTeacher } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { askTeacherSubject, getTeacherSubjects, TeacherApiError } from "@/lib/teacher-app/client";
import { syncTeacherSyllabusToCommunities } from "@/lib/data/community-subjects";
import { revalidatePath } from "next/cache";
import { stripUnitNumber } from "@/lib/syllabus-unit-title";

type Context = { params: Promise<{ slug: string }> };

export const maxDuration = 180;

// A syllabus line is often "Operating System (Introduction, Types of OS, …)" —
// 240 characters on a real TU syllabus (2026-10-09). The old 200 cap rejected
// the WHOLE extraction for that one line; the backend splits such lines into
// micro-topics anyway (rag_service/subtopic_split.py).
const NAME_MAX = 600;
const topicSchema = z.object({ name: z.string().trim().min(1).max(NAME_MAX) });
const chapterSchema = z.object({
  title: z.string().trim().min(1).max(NAME_MAX),
  topics: z.array(topicSchema).max(100),
});
const structureSchema = z.array(chapterSchema).min(1).max(100);

function cleanStructure(structure: z.infer<typeof structureSchema>) {
  return structure.map((unit) => ({ ...unit, title: stripUnitNumber(unit.title) }));
}

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
  const teacher = await getWorkspaceTeacher();
  if (!teacher) return { teacher: null, subject: null, slug: "" };
  const { slug } = await context.params;
  const subjects = await getTeacherSubjects(teacher.collection_sk);
  const subject = subjects.subjects.find((item) => item.slug === slug);
  return { teacher, subject, slug };
}

/**
 * The model's units, keeping every one it can read. One odd entry (an empty
 * topic, a line past the cap) is dropped or clipped instead of failing the
 * extraction: "No structured units were found" for a syllabus that had eleven
 * was the bug. `null` only when the answer is not a JSON list at all.
 */
function parseStructure(answer: string) {
  const fenced = answer.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced || answer.slice(answer.indexOf("["), answer.lastIndexOf("]") + 1);
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(value)) return null;
  const clip = (text: unknown) => (typeof text === "string" ? text.trim().slice(0, NAME_MAX).trim() : "");
  const units = value.slice(0, 100).flatMap((unit) => {
    if (!unit || typeof unit !== "object") return [];
    const record = unit as { title?: unknown; topics?: unknown };
    const title = clip(record.title);
    if (!title) return [];
    const topics = (Array.isArray(record.topics) ? record.topics : [])
      .map((topic) => clip(typeof topic === "string" ? topic : (topic as { name?: unknown } | null)?.name))
      .filter(Boolean)
      .slice(0, 100)
      .map((name) => ({ name }));
    return [{ title, topics }];
  });
  const parsed = structureSchema.safeParse(units);
  return parsed.success ? cleanStructure(parsed.data) : [];
}

export async function GET(_request: Request, context: Context) {
  try {
    // Reading the saved structure needs only Supabase. It used to ask the course
    // API for the subject list first, so a busy backend (2026-09-29: 21s, then a
    // 502) blanked a panel whose data was never on the backend. The row is keyed
    // on this teacher's own id, so nobody else's syllabus can be read this way.
    const teacher = await getWorkspaceTeacher();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { slug } = await context.params;
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("teacher_subject_syllabi")
      .select("structure,updated_at")
      .eq("teacher_id", teacher.id)
      .eq("subject_slug", slug)
      .maybeSingle();
    if (error) throw error;
    const stored = Array.isArray(data?.structure) ? (data.structure as Array<Record<string, unknown>>) : [];
    return NextResponse.json({
      // Saved before titles were cleaned: shown without the "1.4" too.
      structure: stored.map((unit) =>
        typeof unit.title === "string" ? { ...unit, title: stripUnitNumber(unit.title) } : unit,
      ),
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
        structure: cleanStructure(parsed.data),
        updated_at: updatedAt,
      },
      { onConflict: "teacher_id,subject_slug" },
    );
    if (error) throw error;
    const sync = await publishSyllabus(teacher.user_id, teacher.id, slug);
    return NextResponse.json({ structure: cleanStructure(parsed.data), updatedAt, sync });
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
      'Read the indexed syllabus for this subject and extract its units or chapters and topics. Return ONLY valid JSON in this exact shape: [{"title":"Unit title","topics":[{"name":"Topic"}]}]. Include EVERY unit the syllabus lists, in order, and skip none. Write each unit title without its number (not "1.4 Semiconductor Devices" but "Semiconductor Devices"). Do not add markdown or commentary. Preserve the syllabus order and wording. If no syllabus structure is present, return [].',
      15,
      "Use the indexed Syllabus shelf as the source. Return only the requested JSON array and no markdown.",
      [],
      // Only the Syllabus shelf: the whole-subject search let a Drive folder of
      // notes or past papers outvote a one-page syllabus and become its units.
      "Syllabus",
    );
    const answer = typeof result.answer === "string" ? result.answer : "";
    const structure = parseStructure(answer);
    if (!structure?.length) {
      return NextResponse.json(
        {
          error:
            structure === null && answer.trim()
              ? "The syllabus was read, but its units came back in a form that couldn't be used. Try Extract again."
              : "No units were found in the files on this subject's Syllabus shelf. Check the syllabus file lists its units.",
        },
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
