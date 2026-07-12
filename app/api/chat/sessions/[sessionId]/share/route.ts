import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { shareChatSession } from "@/lib/data/chat";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function createShareToken() {
  return randomBytes(24).toString("base64url");
}

function createPublicShareUrl(request: Request, token: string) {
  const url = new URL(request.url);
  return `${url.origin}/share/chat/${encodeURIComponent(token)}`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const share = await shareChatSession(sessionId, user.id, createShareToken());

    if (!share) {
      return NextResponse.json({ error: "Chat session not found." }, { status: 404 });
    }

    return NextResponse.json({
      token: share.token,
      sharedAt: share.sharedAt,
      url: createPublicShareUrl(request, share.token),
    });
  } catch (error) {
    console.error("[CHAT_SHARE] Failed to create share link.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create share link." },
      { status: 500 },
    );
  }
}
