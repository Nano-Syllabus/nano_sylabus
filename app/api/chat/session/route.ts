import { NextResponse } from "next/server";
import { getChatSessionDetail } from "@/lib/data/chat";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session");
  const limitParam = searchParams.get("limit");
  const before = searchParams.get("before") ?? undefined;
  const limit = limitParam ? Number(limitParam) : undefined;

  if (!sessionId) {
    return NextResponse.json({ error: "Missing session parameter." }, { status: 400 });
  }

  const detail = await getChatSessionDetail(sessionId, user.id, {
    limit: Number.isFinite(limit) ? limit : undefined,
    before,
  });
  if (!detail) {
    return NextResponse.json({ error: "Chat session not found." }, { status: 404 });
  }

  return NextResponse.json(detail);
}
