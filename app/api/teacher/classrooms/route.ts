import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTeacherSubjects } from "@/lib/teacher-app/client";

const schema = z.object({
  subjectSlug: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(120),
});

function joinCode() {
  return randomBytes(5).toString("hex").toUpperCase();
}

export async function GET() {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("teacher_classrooms")
      .select("id,subject_slug,subject_name,name,join_code,created_at")
      .eq("teacher_id", teacher.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const ids = (data || []).map((row) => row.id);
    const { data: members } = ids.length
      ? await admin.from("teacher_classroom_members").select("classroom_id").in("classroom_id", ids)
      : { data: [] };
    const counts = new Map<string, number>();
    (members || []).forEach((row) => counts.set(row.classroom_id, (counts.get(row.classroom_id) || 0) + 1));
    return NextResponse.json({
      classrooms: (data || []).map((row) => ({
        id: row.id,
        subjectSlug: row.subject_slug,
        subjectName: row.subject_name,
        name: row.name,
        joinCode: row.join_code,
        memberCount: counts.get(row.id) || 0,
        createdAt: row.created_at,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Could not load classrooms." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid classroom." },
        { status: 400 },
      );
    }
    const subjects = await getTeacherSubjects(teacher.collection_sk);
    const subject = subjects.subjects.find((item) => item.slug === parsed.data.subjectSlug);
    if (!subject || typeof subject.name !== "string") {
      return NextResponse.json({ error: "Subject not found." }, { status: 404 });
    }
    const admin = createSupabaseAdminClient();
    let created = null;
    for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
      const { data, error } = await admin
        .from("teacher_classrooms")
        .insert({
          teacher_id: teacher.id,
          subject_slug: parsed.data.subjectSlug,
          subject_name: subject.name,
          name: parsed.data.name,
          join_code: joinCode(),
        })
        .select("id,subject_slug,subject_name,name,join_code,created_at")
        .single();
      if (!error) created = data;
      else if (error.code !== "23505") throw error;
    }
    if (!created) throw new Error("Could not allocate a classroom code.");
    return NextResponse.json({
      classroom: {
        id: created.id,
        subjectSlug: created.subject_slug,
        subjectName: created.subject_name,
        name: created.name,
        joinCode: created.join_code,
        memberCount: 0,
        createdAt: created.created_at,
      },
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not create the classroom." }, { status: 502 });
  }
}
