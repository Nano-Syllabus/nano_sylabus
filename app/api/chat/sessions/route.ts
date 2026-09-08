import { CACHE, errorJson, privateJson } from "@/lib/http/cache";
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
      return errorJson("Unauthorized", 401);
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

    // REVALIDATE rather than a window: the sidebar list has to be correct the
    // instant after a rename, a pin or a delete, and those all happen in the
    // component rendering it. What the ETag buys here is not skipped work but
    // skipped BYTES — the common case is a student scrolling back to a search
    // they already ran, and that answer is a 304 with no page of titles behind
    // it. TanStack Query's staleTime is what actually removes the request.
    return privateJson(result, { request, profile: CACHE.REVALIDATE });
  } catch (error) {
    return errorJson(
      error instanceof Error ? error.message : "Failed to load chat sessions.",
      500,
    );
  }
}
