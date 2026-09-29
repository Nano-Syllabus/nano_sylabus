import { NextResponse } from "next/server";
import { communityStorageError } from "@/lib/data/communities";
import {
  cancelOwnershipTransfer,
  getOwnershipTransferState,
  startOwnershipTransfer,
} from "@/lib/data/community-ownership-transfer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

type RouteContext = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

async function signedInUserId() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await getVerifiedUser(supabase);
  return user?.id || "";
}

function failure(error: unknown) {
  const mapped = communityStorageError(error);
  return NextResponse.json({ error: mapped.message }, { status: mapped.status });
}

/** The pending offer (if any) and the members who could receive one. Creator only. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const userId = await signedInUserId();
    if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    const { slug } = await context.params;
    return NextResponse.json(await getOwnershipTransferState(userId, slug));
  } catch (error) {
    return failure(error);
  }
}

/** Emails the chosen member a link to accept ownership. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const userId = await signedInUserId();
    if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    const { slug } = await context.params;
    const body = await request.json().catch(() => null);
    const toUserId = typeof body?.toUserId === "string" ? body.toUserId.trim() : "";
    const confirmation = typeof body?.confirmation === "string" ? body.confirmation : "";
    if (!/^[0-9a-f-]{36}$/i.test(toUserId)) {
      return NextResponse.json({ error: "Choose a member to transfer to." }, { status: 400 });
    }
    return NextResponse.json(
      await startOwnershipTransfer({
        userId,
        slug,
        toUserId,
        confirmation,
        requestOrigin: new URL(request.url).origin,
      }),
    );
  } catch (error) {
    return failure(error);
  }
}

/** Withdraws the pending offer; its emailed link stops working. */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const userId = await signedInUserId();
    if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    const { slug } = await context.params;
    return NextResponse.json(await cancelOwnershipTransfer(userId, slug));
  } catch (error) {
    return failure(error);
  }
}
