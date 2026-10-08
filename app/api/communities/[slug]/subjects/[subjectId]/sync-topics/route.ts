import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordFacultyActivity } from "@/lib/data/faculty-activity";
import { NextResponse } from "next/server";
import { communityStorageError } from "@/lib/data/communities";
import { publishCommunitySubject } from "@/lib/data/community-subjects";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

type RouteContext = { params: Promise<{ slug: string; subjectId: string }> };

export const maxDuration = 180;

export async function POST(_request: Request, context: RouteContext) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user)
      return NextResponse.json({ error: "Sign in to publish this subject." }, { status: 401 });
    const { slug, subjectId } = await context.params;
    const result = await publishCommunitySubject(user.id, slug, subjectId);
    await recordPublish(user.id, subjectId);
    return NextResponse.json(result);
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

/** History only: the subject is already published, so a failed read here must not fail the request. */
async function recordPublish(userId: string, subjectId: string) {
  try {
    const { data: subject } = await createSupabaseAdminClient()
      .from("community_subjects")
      .select("name,community_id,communities(name)")
      .eq("id", subjectId)
      .maybeSingle();
    if (!subject) return;
    const faculty = (Array.isArray(subject.communities)
      ? subject.communities[0]
      : subject.communities) as { name: string } | null;
    await recordFacultyActivity({
      actorId: userId,
      action: "subject.published",
      communityId: subject.community_id,
      communityName: faculty?.name ?? null,
      summary: `Published subject ${subject.name}`,
      details: { subjectId, subject: subject.name, via: "creator workspace" },
    });
  } catch (error) {
    console.error("[faculty-activity] publish not recorded", error);
  }
}
