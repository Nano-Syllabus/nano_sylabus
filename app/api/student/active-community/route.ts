import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listJoinedCommunities, communityStorageError } from "@/lib/data/communities";
import { ACTIVE_COMMUNITY_COOKIE, communitySwitchState } from "@/lib/community-switch";

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Sign in to switch communities." }, { status: 401 });
    const body = await request.json().catch(() => null);
    const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
    if (!slug || slug.length > 100) {
      return NextResponse.json({ error: "Choose a valid community." }, { status: 400 });
    }
    const state = communitySwitchState(user.id, await listJoinedCommunities(user.id));
    const target = state.options.find((option) => option.slug === slug);
    if (!state.canSwitch || !target) {
      return NextResponse.json({ error: "You cannot switch to this community." }, { status: 403 });
    }
    const response = NextResponse.json({ slug: target.slug });
    response.cookies.set(
      ACTIVE_COMMUNITY_COOKIE,
      JSON.stringify({ userId: user.id, slug: target.slug }),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      },
    );
    return response;
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
