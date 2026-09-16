import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { readTeacherWorkspace, TeacherApiError } from "@/lib/teacher-app/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { profileFromUser, withTeacherAvatar } from "@/lib/teacher-public-profile";
import { groupSubjectCommunities } from "@/lib/teacher-subject-access";

// The four tenant reads get 10s and one retry each (`workspaceReadOptions`), so
// the worst honest case is ~20s. Vercel's default function budget is shorter
// than that, which would kill the invocation mid-retry and hand the browser a
// platform error instead of this route's own 503 and Retry-After.
export const maxDuration = 30;

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

    // ONE round of fan-out, not four rounds of one.
    //
    // Everything below needs only `teacher` and `user`, both of which are already
    // in hand — nothing here reads another's result. Written as four sequential
    // stages it cost four round trips end to end: the tenant API, then the admin
    // queries, then the profile, then the avatar. Against Supabase measured at
    // ~165ms a hop (and the tenant API slower still), that was most of the wait on
    // a screen that computes nothing.
    const admin = createSupabaseAdminClient();
    const [
      tenant,
      documentFilesResult, subjectProfilesResult, communityLinks,
      profileResult, publicProfile,
    ] = await Promise.all([
      readTeacherWorkspace(teacher.collection_sk),
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
      admin
        .from("community_subjects")
        .select("external_subject_slug,status,communities!inner(slug,name,status)")
        .eq("teacher_id", teacher.id)
        .eq("status", "active")
        .eq("communities.status", "active"),
      admin
        .from("student_profiles")
        .select("full_name,language_pref")
        .eq("user_id", user.id)
        .maybeSingle(),
      withTeacherAvatar(admin, profileFromUser(user, teacher.handle)),
    ]);
    const { collection, subjects, sourceTree, documents } = tenant;
    const { data: documentFiles } = documentFilesResult;
    const { data: subjectProfiles } = subjectProfilesResult;
    const { data: profile } = profileResult;
    // Never mislabel shared material if its access metadata could not be read.
    if (communityLinks.error)
      throw new Error("Could not load subject community access. Please try again.");
    const communitiesBySubject = groupSubjectCommunities(communityLinks.data || []);

    return NextResponse.json({
      // Truthful about which of the two things the teacher is looking at: the
      // collection as it is, or the last one that loaded. Only ever set when the
      // alternative was an error page.
      stale: tenant.stale,
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
      subjectProfiles: (subjectProfiles || []).map((profile) => ({
        ...profile,
        communities: communitiesBySubject.get(String(profile.subject_slug)) || [],
      })),
      previewPaths: (documentFiles || []).flatMap((item) =>
        [item.collection_path, item.external_document_id, item.id].filter(
          (value): value is string => typeof value === "string" && Boolean(value),
        ),
      ),
    });
  } catch (error) {
    const invalidKey = error instanceof TeacherApiError && error.status === 401;
    const upstreamUnavailable =
      error instanceof TeacherApiError && [408, 429, 500, 502, 503, 504].includes(error.status);
    return NextResponse.json(
      {
        error: invalidKey
          ? "This teacher workspace key is no longer valid. Ask an administrator to rotate it."
          : upstreamUnavailable
            ? "The creator service is taking longer than expected. Please try again in a moment."
            : error instanceof Error
              ? error.message
              : "Could not load the teacher workspace.",
        code: invalidKey
          ? "invalid_workspace_key"
          : upstreamUnavailable
            ? "teacher_service_unavailable"
            : "workspace_load_failed",
      },
      {
        status: invalidKey ? 409 : upstreamUnavailable ? 503 : 502,
        headers: upstreamUnavailable ? { "Retry-After": "3" } : undefined,
      },
    );
  }
}
