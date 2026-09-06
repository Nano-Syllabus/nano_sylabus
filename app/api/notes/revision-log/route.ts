import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

const revisionLogSchema = z.object({
  noteId: z.string().uuid(),
  action: z.enum(["remember", "review", "skip"]),
});

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = revisionLogSchema.parse(await request.json());

    const { data: note } = await supabase
      .from("revision_notes")
      .select("id")
      .eq("id", payload.noteId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!note) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }

    const { error } = await supabase.from("note_revision_logs").insert({
      note_id: payload.noteId,
      user_id: user.id,
      action: payload.action,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to log revision action." },
      { status: 500 },
    );
  }
}
