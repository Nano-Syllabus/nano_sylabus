import { NextResponse } from "next/server";
import { communityStorageError } from "@/lib/data/communities";
import { reportCommunityPost } from "@/lib/data/community-subjects";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await getVerifiedUser(supabase);
    if (!user) return NextResponse.json({ error: "Sign in to report." }, { status: 401 });
    const body = await request.json().catch(() => null) as { reason?: unknown } | null;
    const { postId } = await params;
    const result = await reportCommunityPost(user.id, postId, typeof body?.reason === "string" ? body.reason : "");
    return NextResponse.json(result);
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
