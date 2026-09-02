import { NextResponse } from "next/server";
import { communityStorageError } from "@/lib/data/communities";
import { archiveCommunityAnnouncement } from "@/lib/data/community-hub";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ slug: string; announcementId: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Sign in to manage announcements." }, { status: 401 });
    const { slug, announcementId } = await context.params;
    const result = await archiveCommunityAnnouncement(user.id, slug, announcementId);
    return NextResponse.json(result);
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
