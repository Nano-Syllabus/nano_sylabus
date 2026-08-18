import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  teacherCourseInputSchema,
  teacherCourseRow,
  teacherCourseSlug,
} from "@/lib/teacher-courses";
import {
  courseStorageError,
  findAssignedCourseSubjects,
  isCourseSubjectOwnershipConflict,
  listTeacherCourses,
} from "@/lib/teacher-course-store";

async function resolveSubjects(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  teacherId: string,
  requestedSlugs: string[],
) {
  if (!requestedSlugs.length) return [];
  const result = await admin
    .from("teacher_subject_profiles")
    .select("subject_slug,subject_name,folder_path,visibility")
    .eq("teacher_id", teacherId)
    .in("subject_slug", requestedSlugs);
  if (result.error) throw result.error;
  const bySlug = new Map((result.data || []).map((subject) => [String(subject.subject_slug || ""), subject]));
  return requestedSlugs.map((slug, position) => {
    const subject = bySlug.get(slug);
    if (!subject || subject.visibility !== "public") {
      throw new Error(`Only public created subjects can be added to a course: ${slug}`);
    }
    return {
      subject_slug: slug,
      subject_name: String(subject.subject_name || slug),
      folder_path: String(subject.folder_path || ""),
      position,
    };
  });
}

async function availableSlug(admin: ReturnType<typeof createSupabaseAdminClient>, name: string) {
  const base = teacherCourseSlug(name);
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix ? `${base}-${suffix + 1}` : base;
    const result = await admin
      .from("teacher_courses")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return candidate;
  }
  throw new Error("Could not create a unique course URL.");
}

export async function GET() {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const courses = await listTeacherCourses(createSupabaseAdminClient(), teacher.id);
    return NextResponse.json({ courses });
  } catch (error) {
    return NextResponse.json({ error: courseStorageError(error) }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = teacherCourseInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid course." },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdminClient();
    let subjects;
    try {
      subjects = await resolveSubjects(admin, teacher.id, parsed.data.subjectSlugs);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Subject not found." },
        { status: 400 },
      );
    }

    const assignedSubjects = await findAssignedCourseSubjects(
      admin,
      teacher.id,
      parsed.data.subjectSlugs,
    );
    if (assignedSubjects.length) {
      const names = subjects
        .filter((subject) =>
          assignedSubjects.some((assigned) => assigned.subject_slug === subject.subject_slug),
        )
        .map((subject) => subject.subject_name);
      return NextResponse.json(
        { error: `${names.join(", ")} already belongs to another course.` },
        { status: 409 },
      );
    }
    const slug = await availableSlug(admin, parsed.data.name);
    const courseResult = await admin
      .from("teacher_courses")
      .insert({ teacher_id: teacher.id, slug, ...teacherCourseRow(parsed.data) })
      .select("id")
      .single();
    if (courseResult.error) throw courseResult.error;

    const subjectResult = subjects.length
      ? await admin.from("teacher_course_subjects").insert(
          subjects.map((subject) => ({
            course_id: courseResult.data.id,
            teacher_id: teacher.id,
            ...subject,
          })),
        )
      : { error: null };
    if (subjectResult.error) {
      await admin.from("teacher_courses").delete().eq("id", courseResult.data.id);
      if (isCourseSubjectOwnershipConflict(subjectResult.error)) {
        return NextResponse.json(
          { error: "A selected subject was just assigned to another course." },
          { status: 409 },
        );
      }
      throw subjectResult.error;
    }

    if (subjects.length) {
      const profileResult = await admin
        .from("teacher_subject_profiles")
        .update({ visibility: "public", updated_at: new Date().toISOString() })
        .eq("teacher_id", teacher.id)
        .in("subject_slug", parsed.data.subjectSlugs);
      if (profileResult.error) throw profileResult.error;
    }

    const courses = await listTeacherCourses(admin, teacher.id);
    return NextResponse.json(
      { course: courses.find((course) => course.id === courseResult.data.id) },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json({ error: courseStorageError(error) }, { status: 502 });
  }
}
