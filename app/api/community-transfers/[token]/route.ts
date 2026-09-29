import { NextResponse } from "next/server";
import { communityStorageError } from "@/lib/data/communities";
import { respondToOwnershipTransfer } from "@/lib/data/community-ownership-transfer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

type RouteContext = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

/** The emailed member accepts or declines ownership: `{ action: "accept" | "decline" }`. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user)
      return NextResponse.json({ error: "Sign in to answer this transfer." }, { status: 401 });
    const { token } = await context.params;
    const body = await request.json().catch(() => null);
    const action = body?.action === "decline" ? "decline" : body?.action === "accept" ? "accept" : null;
    if (!action) return NextResponse.json({ error: "Choose accept or decline." }, { status: 400 });
    return NextResponse.json(await respondToOwnershipTransfer(user.id, token, action));
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
