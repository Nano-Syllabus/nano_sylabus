import { NextResponse } from "next/server";
import { isChallengeQuestionFormat } from "@/lib/challenge-format";
import { communityStorageError } from "@/lib/data/communities";
import {
  readCommunityChallengeFormat,
  setCommunityChallengeFormat,
} from "@/lib/data/community-challenge-format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

type RouteContext = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const state = await readCommunityChallengeFormat(slug);
    if (!state) return NextResponse.json({ error: "Community not found." }, { status: 404 });
    return NextResponse.json(state);
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

/** Changes the format for every student in the community, from their next sitting. */
export async function PUT(request: Request, context: RouteContext) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user) return NextResponse.json({ error: "Sign in to change this community." }, { status: 401 });
    const body = (await request.json().catch(() => null)) as { format?: unknown } | null;
    if (!isChallengeQuestionFormat(body?.format)) {
      return NextResponse.json(
        { error: "Choose QnA, MCQ or hybrid challenge questions." },
        { status: 400 },
      );
    }
    const { slug } = await context.params;
    return NextResponse.json(await setCommunityChallengeFormat(user.id, slug, body.format));
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
