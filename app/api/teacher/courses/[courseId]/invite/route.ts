import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createCourseInviteCode } from "@/lib/course-invites";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { courseStorageError, listTeacherCourses } from "@/lib/teacher-course-store";

type RouteContext = { params: Promise<{ courseId: string }> };

async function ownedInviteOnlyCourse(courseId: string, teacherId: string) {
  const admin = createSupabaseAdminClient();
  const result = await admin
    .from("teacher_courses")
    .select("id")
    .eq("id", courseId)
    .eq("teacher_id", teacherId)
    .eq("status", "published")
    .eq("visibility", "unlisted")
    .is("archived_at", null)
    .maybeSingle();
  if (result.error) throw result.error;
  return { admin, course: result.data };
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { courseId } = await context.params;
    const { admin, course } = await ownedInviteOnlyCourse(courseId, teacher.id);
    if (!course) {
      return NextResponse.json(
        { error: "Publish this course as invite-only before creating a share link." },
        { status: 409 },
      );
    }

    const result = await admin
      .from("teacher_courses")
      .update({
        invite_code: createCourseInviteCode(),
        invite_created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", courseId)
      .eq("teacher_id", teacher.id)
      .eq("status", "published")
      .eq("visibility", "unlisted")
      .is("archived_at", null)
      .select("id")
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) {
      return NextResponse.json(
        { error: "This course is no longer published as invite-only." },
        { status: 409 },
      );
    }

    const courses = await listTeacherCourses(admin, teacher.id);
    return NextResponse.json({ course: courses.find((item) => item.id === courseId) });
  } catch (error) {
    return NextResponse.json(
      { error: courseStorageError(error, "Could not regenerate this course invite.") },
      { status: 502 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { courseId } = await context.params;
    const { admin, course } = await ownedInviteOnlyCourse(courseId, teacher.id);
    if (!course) {
      return NextResponse.json({ error: "Invite-only course not found." }, { status: 404 });
    }

    const result = await admin
      .from("teacher_courses")
      .update({ invite_code: null, invite_created_at: null, updated_at: new Date().toISOString() })
      .eq("id", courseId)
      .eq("teacher_id", teacher.id)
      .eq("status", "published")
      .eq("visibility", "unlisted")
      .is("archived_at", null)
      .select("id")
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) {
      return NextResponse.json(
        { error: "This course is no longer published as invite-only." },
        { status: 409 },
      );
    }

    const courses = await listTeacherCourses(admin, teacher.id);
    return NextResponse.json({ course: courses.find((item) => item.id === courseId) });
  } catch (error) {
    return NextResponse.json(
      { error: courseStorageError(error, "Could not disable this course invite.") },
      { status: 502 },
    );
  }
}
