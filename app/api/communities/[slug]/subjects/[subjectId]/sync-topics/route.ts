import { NextResponse } from "next/server";
import { communityStorageError } from "@/lib/data/communities";
import { syncCommunitySubjectTopics } from "@/lib/data/community-subjects";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ slug: string; subjectId: string }> };

export const maxDuration = 180;

export async function POST(_request: Request, context: RouteContext) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to refresh topics." }, { status: 401 });
    const { slug, subjectId } = await context.params;
    const result = await syncCommunitySubjectTopics(user.id, slug, subjectId);
    return NextResponse.json(result);
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
