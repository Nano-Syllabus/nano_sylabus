import { NextResponse } from "next/server";
import { communityStorageError, deleteOwnedCommunity, getCommunity } from "@/lib/data/communities";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Sign in to delete your community." }, { status: 401 });
    const { slug } = await context.params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body.confirmation !== "string" || body.confirmation !== slug) {
      return NextResponse.json(
        { error: "Type the community URL name exactly to confirm deletion." },
        { status: 400 },
      );
    }
    return NextResponse.json(await deleteOwnedCommunity(user.id, slug, body.confirmation));
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

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
