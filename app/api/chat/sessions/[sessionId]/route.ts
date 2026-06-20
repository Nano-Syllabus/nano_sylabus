import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteChatSession, updateChatSession } from "@/lib/data/chat";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    subjectContext: z.string().trim().min(1).max(120).nullable().optional(),
    isPinned: z.boolean().optional(),
  })
  .refine((payload) => payload.title !== undefined || payload.subjectContext !== undefined || payload.isPinned !== undefined, {
    message: "At least one field is required.",
  });

export async function PATCH(
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

    const payload = patchSchema.parse(await request.json());
    const session = await updateChatSession(sessionId, user.id, {
      title: payload.title,
      subjectContext: payload.subjectContext,
      isPinned: payload.isPinned,
    });

    if (!session) {
      return NextResponse.json({ error: "Chat session not found." }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to rename chat session." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
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

    const deleted = await deleteChatSession(sessionId, user.id);

    if (!deleted) {
      return NextResponse.json({ error: "Chat session not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete chat session." },
      { status: 500 },
    );
  }
}
