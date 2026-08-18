import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import {
  getTeacherDocuments,
  getTeacherMe,
  getTeacherSourceTree,
  getTeacherSubjects,
  TeacherApiError,
} from "@/lib/teacher-app/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { profileFromUser, withTeacherAvatar } from "@/lib/teacher-public-profile";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const teacher = await getTeacherProfile();
    if (!teacher) {
      return NextResponse.json({ error: "Teacher workspace not found." }, { status: 404 });
    }

    const [collection, subjects, sourceTree, documents] = await Promise.all([
      getTeacherMe(teacher.collection_sk),
      getTeacherSubjects(teacher.collection_sk),
      getTeacherSourceTree(teacher.collection_sk),
      getTeacherDocuments(teacher.collection_sk),
    ]);
    const admin = createSupabaseAdminClient();
    const [{ data: documentFiles }, { data: subjectProfiles }] = await Promise.all([
      admin
        .from("teacher_document_files")
        .select("id,collection_path,external_document_id")
        .eq("teacher_id", teacher.id),
      admin
        .from("teacher_subject_profiles")
        .select(
          "subject_slug,subject_name,subject_code,university,programme,visibility,folder_path",
        )
        .eq("teacher_id", teacher.id),
    ]);
    const { data: profile } = await admin
      .from("student_profiles")
      .select("full_name,language_pref")
      .eq("user_id", user.id)
      .maybeSingle();
    const publicProfile = await withTeacherAvatar(admin, profileFromUser(user, teacher.handle));

    return NextResponse.json({
      teacher: {
        handle: teacher.handle,
        email: user.email ?? "",
        fullName:
          profile?.full_name ||
          (typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : teacher.handle),
        language: profile?.language_pref === "RN" ? "RN" : "EN",
        answerStyle:
          user.user_metadata?.teacher_answer_style === "concise" ? "concise" : "exam_focused",
        publicProfile,
      },
      collection,
      subjects,
      sourceTree,
      documents,
      subjectProfiles: subjectProfiles || [],
      previewPaths: (documentFiles || []).flatMap((item) =>
        [item.collection_path, item.external_document_id, item.id].filter(
          (value): value is string => typeof value === "string" && Boolean(value),
        ),
      ),
    });
  } catch (error) {
    const invalidKey = error instanceof TeacherApiError && error.status === 401;
    return NextResponse.json(
      {
        error: invalidKey
          ? "This teacher workspace key is no longer valid. Ask an administrator to rotate it."
          : error instanceof Error
            ? error.message
            : "Could not load the teacher workspace.",
      },
      { status: invalidKey ? 409 : 502 },
    );
  }
}
