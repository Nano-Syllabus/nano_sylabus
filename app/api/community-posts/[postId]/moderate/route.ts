import { NextResponse } from "next/server";
import { communityStorageError } from "@/lib/data/communities";
import { hideCommunityPost } from "@/lib/data/community-subjects";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(_request: Request, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to moderate." }, { status: 401 });
    const { postId } = await params;
    const result = await hideCommunityPost(user.id, postId);
    return NextResponse.json(result);
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
