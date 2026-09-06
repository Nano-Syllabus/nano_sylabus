import { NextResponse } from "next/server";
import { communityInputSchema } from "@/lib/communities";
import {
  communityStorageError,
  createCommunity,
  listPublicCommunities,
} from "@/lib/data/communities";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    const communities = await listPublicCommunities(user?.id);
    return NextResponse.json({ communities });
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user)
      return NextResponse.json({ error: "Sign in to create a community." }, { status: 401 });

    const parsed = communityInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message || "Check the community details and try again.",
          field: parsed.error.issues[0]?.path[0] || null,
        },
        { status: 400 },
      );
    }

    const community = await createCommunity(user.id, parsed.data);
    return NextResponse.json({ community }, { status: 201 });
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
