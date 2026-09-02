import { NextResponse } from "next/server";
import { communityStorageError } from "@/lib/data/communities";
import { voteCommunityPost } from "@/lib/data/community-subjects";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ postId: string }> };

export const maxDuration = 300;

export async function POST(_request: Request, context: RouteContext) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to vote." }, { status: 401 });
    const { postId } = await context.params;
    const result = await voteCommunityPost(user.id, postId);
    return NextResponse.json(result, { status: result.mergeError ? 202 : 200 });
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
