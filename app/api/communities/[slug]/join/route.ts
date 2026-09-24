import { NextResponse } from "next/server";
import { communityStorageError, joinCommunity } from "@/lib/data/communities";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(_request: Request, context: RouteContext) {
  let slug = "unknown";
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user)
      return NextResponse.json({ error: "Sign in to join this community." }, { status: 401 });

    ({ slug } = await context.params);
    const community = await joinCommunity(user.id, slug);
    return NextResponse.json({ community });
  } catch (error) {
    const source = (error || {}) as { code?: string; message?: string };
    console.error("[community:join] failed", {
      slug,
      code: source.code,
      message: source.message,
    });
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
