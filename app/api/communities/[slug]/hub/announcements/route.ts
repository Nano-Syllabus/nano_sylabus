import { NextResponse } from "next/server";
import { communityStorageError } from "@/lib/data/communities";
import { createCommunityAnnouncement } from "@/lib/data/community-hub";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Sign in to publish an announcement." }, { status: 401 });
    const body = (await request.json().catch(() => null)) as {
      title?: unknown;
      body?: unknown;
    } | null;
    const { slug } = await context.params;
    const announcement = await createCommunityAnnouncement(user.id, slug, {
      title: typeof body?.title === "string" ? body.title : "",
      body: typeof body?.body === "string" ? body.body : "",
    });
    return NextResponse.json({ announcement }, { status: 201 });
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
