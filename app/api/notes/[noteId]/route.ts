import { NextResponse } from "next/server";
import { z } from "zod";
import { getRevisionNoteDetail } from "@/lib/data/notes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const updateSchema = z.object({
  title: z.string().min(1).max(160),
  subjectTag: z.string().min(1).max(120),
  chapterTag: z.string().max(120).optional().nullable(),
  annotation: z.string().max(500).optional().nullable(),
  colorLabel: z.enum(["red", "yellow", "green"]),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ noteId: string }> },
) {
  try {
    const { noteId } = await params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const note = await getRevisionNoteDetail(noteId, user.id);
    if (!note) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }

    return NextResponse.json(note);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load note." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ noteId: string }> },
) {
  try {
    const { noteId } = await params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = updateSchema.parse(await request.json());

    const { data, error } = await supabase
      .from("revision_notes")
      .update({
        title: payload.title,
        subject_tag: payload.subjectTag,
        chapter_tag: payload.chapterTag || null,
        annotation: payload.annotation || null,
        colour_label: payload.colorLabel,
      })
      .eq("id", noteId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update note." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ noteId: string }> },
) {
  try {
    const { noteId } = await params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("revision_notes")
      .delete()
      .eq("id", noteId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete note." },
      { status: 500 },
    );
  }
}
