import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { communityStorageError } from "@/lib/data/communities";
import { leaveCommunityMembership, setCommunityCurrentTerm } from "@/lib/data/community-hub";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ slug: string }> };

async function authenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await authenticatedUser();
    if (!user)
      return NextResponse.json({ error: "Sign in to update your community." }, { status: 401 });
    const body = (await request.json().catch(() => null)) as { termId?: unknown } | null;
    const termId = typeof body?.termId === "string" ? body.termId : "";
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(termId)
    ) {
      return NextResponse.json({ error: "Choose a valid semester." }, { status: 400 });
    }
    const { slug } = await context.params;
    const result = await setCommunityCurrentTerm(user.id, slug, termId);
    revalidatePath("/app", "layout");
    return NextResponse.json(result);
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await authenticatedUser();
    if (!user)
      return NextResponse.json({ error: "Sign in to leave your community." }, { status: 401 });
    const { slug } = await context.params;
    const result = await leaveCommunityMembership(user.id, slug);
    revalidatePath("/app", "layout");
    revalidatePath("/communities", "layout");
    return NextResponse.json(result);
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
