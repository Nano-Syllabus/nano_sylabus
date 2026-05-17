import { NextResponse } from "next/server";
import { z } from "zod";
import { getNoteAccessPolicy } from "@/lib/data/note-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const noteSchema = z.object({
  sessionId: z.string().uuid(),
  messageId: z.string().uuid(),
  title: z.string().min(1).max(160),
  subjectTag: z.string().min(1).max(120),
  chapterTag: z.string().max(120).optional().nullable(),
  annotation: z.string().max(500).optional().nullable(),
  colorLabel: z.enum(["red", "yellow", "green"]),
});

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = noteSchema.parse(await request.json());
    const access = await getNoteAccessPolicy(user.id);

    const { data: session } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("id", payload.sessionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ error: "Chat session not found." }, { status: 404 });
    }

    const { data: message } = await supabase
      .from("chat_messages")
      .select("id, role, session_id")
      .eq("id", payload.messageId)
      .eq("session_id", payload.sessionId)
      .maybeSingle();

    if (!message || message.role !== "assistant") {
      return NextResponse.json({ error: "Assistant message not found." }, { status: 404 });
    }

    const { data: existingNote } = await supabase
      .from("revision_notes")
      .select("id")
      .eq("user_id", user.id)
      .eq("message_id", payload.messageId)
      .maybeSingle();

    if (!existingNote && Number.isFinite(access.maxNotes)) {
      const { count, error: countError } = await supabase
        .from("revision_notes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 500 });
      }

      if ((count ?? 0) >= access.maxNotes) {
        return NextResponse.json(
          {
            error: `You have reached your note limit (${access.maxNotes}) for the ${access.tier} plan.`,
            code: "NOTE_LIMIT_REACHED",
          },
          { status: 403 },
        );
      }
    }

    const { data, error } = await supabase
      .from("revision_notes")
      .upsert(
        {
          user_id: user.id,
          session_id: payload.sessionId,
          message_id: payload.messageId,
          title: payload.title,
          subject_tag: payload.subjectTag,
          chapter_tag: payload.chapterTag || null,
          annotation: payload.annotation || null,
          colour_label: payload.colorLabel,
        },
        {
          onConflict: "user_id,message_id",
        },
      )
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save note." },
      { status: 500 },
    );
  }
}
