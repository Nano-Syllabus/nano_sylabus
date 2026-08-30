import { NextResponse } from "next/server";
import { communityStorageError, getCommunity } from "@/lib/data/communities";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { slug } = await context.params;
    const community = await getCommunity(slug, user?.id);
    if (!community) return NextResponse.json({ error: "Community not found." }, { status: 404 });
    return NextResponse.json({ community });
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
