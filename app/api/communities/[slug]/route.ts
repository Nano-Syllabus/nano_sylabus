import { NextResponse } from "next/server";
import { communityInputSchema, communityNameSchema } from "@/lib/communities";
import {
  communityStorageError,
  deleteOwnedCommunity,
  getCommunity,
  updateOwnedCommunityDetails,
  updateOwnedCommunityName,
} from "@/lib/data/communities";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

type RouteContext = { params: Promise<{ slug: string }> };

const detailsSchema = communityInputSchema
  .innerType()
  .pick({ faculty: true })
  .partial();

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user)
      return NextResponse.json({ error: "Sign in to edit your community." }, { status: 401 });

    const { slug } = await context.params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    }

    // University and level are fixed once the faculty exists (user, 2026-10-02):
    // only the name and the short name change here.
    if (body.university !== undefined || body.level !== undefined) {
      return NextResponse.json(
        { error: "A faculty's university and level can't be changed." },
        { status: 400 },
      );
    }
    const details = detailsSchema.safeParse({ faculty: body.faculty });
    if (!details.success) {
      const issue = details.error.issues[0];
      return NextResponse.json(
        { error: issue?.message || "Check the details and try again.", field: issue?.path[0] },
        { status: 400 },
      );
    }
    const hasDetails = Object.values(details.data).some((value) => value !== undefined);
    if (body.name === undefined && !hasDetails) {
      return NextResponse.json({ error: "Enter a valid community name.", field: "name" }, { status: 400 });
    }
    let community = null;
    if (body.name !== undefined) {
      const parsed = communityNameSchema.safeParse(body.name);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: parsed.error.issues[0]?.message || "Enter a valid community name.",
            field: "name",
          },
          { status: 400 },
        );
      }
      community = await updateOwnedCommunityName(user.id, slug, parsed.data);
    }
    if (hasDetails) {
      community = await updateOwnedCommunityDetails(user.id, slug, details.data);
    }
    return NextResponse.json({ community });
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user)
      return NextResponse.json({ error: "Sign in to delete your community." }, { status: 401 });
    const { slug } = await context.params;
    const body = await request.json().catch(() => null);
    // The creator types the community's NAME; the name check and the member
    // limit are enforced in deleteOwnedCommunity.
    if (!body || typeof body.confirmation !== "string" || !body.confirmation.trim()) {
      return NextResponse.json(
        { error: "Type the community name exactly to confirm deletion." },
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
    } = await getVerifiedUser(supabase);
    const { slug } = await context.params;
    const community = await getCommunity(slug, user?.id);
    if (!community) return NextResponse.json({ error: "Community not found." }, { status: 404 });
    return NextResponse.json({ community });
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
