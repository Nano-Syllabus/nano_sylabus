import { NextResponse } from "next/server";
import { communitySubjectInputSchema } from "@/lib/communities";
import {
  attachCommunitySubject,
  communityStorageError,
  listCommunityCreatorSubjects,
} from "@/lib/data/communities";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to manage subjects." }, { status: 401 });

    const { slug } = await context.params;
    const subjects = await listCommunityCreatorSubjects(user.id, slug);
    return NextResponse.json({ subjects });
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to add a subject." }, { status: 401 });

    const parsed = communitySubjectInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message || "Check the subject details and try again.",
          field: parsed.error.issues[0]?.path[0] || null,
        },
        { status: 400 },
      );
    }

    const { slug } = await context.params;
    const community = await attachCommunitySubject(user.id, slug, parsed.data);
    return NextResponse.json({ community }, { status: 201 });
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
