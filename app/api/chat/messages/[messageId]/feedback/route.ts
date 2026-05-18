import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const feedbackSchema = z.object({
  feedback: z.enum(["up", "down"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { messageId } = await params;
    const payload = feedbackSchema.parse(await request.json());

    const { data: existingMessage } = await supabase
      .from("chat_messages")
      .select("id, role, session_id")
      .eq("id", messageId)
      .maybeSingle();

    if (!existingMessage || existingMessage.role !== "assistant") {
      return NextResponse.json({ error: "Assistant message not found." }, { status: 404 });
    }

    const { data: session } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("id", existingMessage.session_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ error: "Chat session not found." }, { status: 404 });
    }

    const adminSupabase = createSupabaseAdminClient();
    const { data, error } = await adminSupabase
      .from("chat_messages")
      .update({ feedback: payload.feedback })
      .eq("id", messageId)
      .eq("session_id", existingMessage.session_id)
      .select("id, feedback")
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "Failed to save feedback." }, { status: 500 });
    }

    return NextResponse.json({
      id: data.id,
      feedback: data.feedback,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save feedback." },
      { status: 500 },
    );
  }
}
