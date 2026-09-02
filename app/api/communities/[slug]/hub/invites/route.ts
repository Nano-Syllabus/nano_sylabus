import { NextResponse } from "next/server";
import { communityStorageError } from "@/lib/data/communities";
import { createCommunityInvite } from "@/lib/data/community-hub";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to invite a peer." }, { status: 401 });
    const { slug } = await context.params;
    const invite = await createCommunityInvite(user.id, slug);
    return NextResponse.json({ invite }, { status: 201 });
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
