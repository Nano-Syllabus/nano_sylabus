import { NextResponse } from "next/server";
import { communityStorageError } from "@/lib/data/communities";
import { getCommunityInvite, redeemCommunityInvite } from "@/lib/data/community-hub";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ token: string }> };

function validToken(token: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token);
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    if (!validToken(token))
      return NextResponse.json({ error: "Invite not found." }, { status: 404 });
    const invite = await getCommunityInvite(token);
    if (!invite) return NextResponse.json({ error: "Invite not found." }, { status: 404 });
    return NextResponse.json({ invite });
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Sign in to accept this invite." }, { status: 401 });
    const { token } = await context.params;
    if (!validToken(token))
      return NextResponse.json({ error: "Invite not found." }, { status: 404 });
    const community = await redeemCommunityInvite(user.id, token);
    return NextResponse.json({ community });
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
