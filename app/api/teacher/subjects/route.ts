import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createTeacherSubject, TeacherApiError } from "@/lib/teacher-app/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function validSubjectName(value: unknown) {
  if (typeof value !== "string") return "";
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 120) return "";
  if (name === "." || name === "..") return "";
  if (/[\\/\u0000-\u001f]/.test(name)) return "";
  return name;
}

const subjectSetupSchema = z.object({
  name: z.unknown(),
  code: z.string().trim().max(40).optional().default(""),
  university: z.string().trim().max(120).optional().default(""),
  programme: z.string().trim().max(120).optional().default(""),
});

export async function POST(request: Request) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = subjectSetupSchema.safeParse(await request.json().catch(() => null));
    const name = validSubjectName(parsed.success ? parsed.data.name : undefined);
    if (!name) {
      return NextResponse.json(
        { error: "Enter a subject name up to 120 characters, without slashes." },
        { status: 400 },
      );
    }

    const subject = await createTeacherSubject(teacher.collection_sk, name);
    let profileSaved = false;
    if (parsed.success) {
      try {
        const admin = createSupabaseAdminClient();
        const { error } = await admin.from("teacher_subject_profiles").upsert(
          {
            teacher_id: teacher.id,
            subject_slug: String(subject.slug),
            subject_name: name,
            subject_code: parsed.data.code,
            university: parsed.data.university,
            programme: parsed.data.programme,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "teacher_id,subject_slug" },
        );
        profileSaved = !error;
      } catch {
        // Subject creation must remain usable before the optional profile
        // migration is applied. Collection files and retrieval are unaffected.
      }
    }
    return NextResponse.json({ subject, profileSaved }, { status: 201 });
  } catch (error) {
    const apiError = error instanceof TeacherApiError ? error : null;
    const invalidKey = apiError?.status === 401;
    const conflict = apiError?.status === 409;

    return NextResponse.json(
      {
        error: invalidKey
          ? "This teacher workspace key is no longer valid. Ask an administrator to rotate it."
          : conflict
            ? apiError.message || "That subject already exists."
            : "Could not create the subject. Please try again.",
      },
      { status: invalidKey || conflict ? 409 : 502 },
    );
  }
}
