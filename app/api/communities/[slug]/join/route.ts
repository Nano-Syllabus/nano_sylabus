import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
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
    // The join is committed; a failed revalidation must not report it as failed.
    try {
      revalidatePath("/app", "layout");
      revalidatePath("/communities", "layout");
    } catch {
      /* the next navigation renders fresh anyway */
    }
    return NextResponse.json({ community });
  } catch (error) {
    const source = (error || {}) as { code?: string; message?: string };
    console.error("[community:join] failed", {
      slug,
      code: source.code,
      message: source.message,
    });
    const mapped = communityStorageError(error);
    return NextResponse.json(
      { error: mapped.message, ...(mapped.current ? { current: mapped.current } : {}) },
      { status: mapped.status },
    );
  }
}
