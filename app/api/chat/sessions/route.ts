import { NextResponse } from "next/server";
import { z } from "zod";
import { listChatSessions } from "@/lib/data/chat";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

const querySchema = z.object({
  q: z.string().optional(),
  offset: z.coerce.number().min(0).default(0),
  limit: z.coerce.number().min(1).max(50).default(20),
});

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = new URL(request.url).searchParams;
    const parsed = querySchema.parse({
      q: params.get("q") ?? undefined,
      offset: params.get("offset") ?? undefined,
      limit: params.get("limit") ?? undefined,
    });

    const result = await listChatSessions(user.id, {
      search: parsed.q,
      offset: parsed.offset,
      limit: parsed.limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load chat sessions." },
      { status: 500 },
    );
  }
}
