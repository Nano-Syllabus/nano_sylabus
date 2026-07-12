import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const feedbackSchema = z.object({
  feedback: z.enum(["up", "down"]).nullable(),
});

type FeedbackValue = z.infer<typeof feedbackSchema>["feedback"];
type FeedbackRow = {
  id: string;
  feedback: FeedbackValue;
};

function getSupabaseErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return null;
  if ("message" in error && typeof error.message === "string") return error.message;
  return null;
}

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
    const rawPayload = await request.json().catch(() => null);
    const parsedPayload = feedbackSchema.safeParse(rawPayload);

    if (!parsedPayload.success) {
      return NextResponse.json({ error: "Invalid feedback payload." }, { status: 400 });
    }

    const payload = parsedPayload.data;

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

    let data: FeedbackRow | null = null;
    let saveError: unknown = null;

    const rpcResult = await supabase
      .rpc("set_chat_message_feedback", {
        p_message_id: messageId,
        p_feedback: payload.feedback,
      })
      .maybeSingle<FeedbackRow>();

    if (rpcResult.error) {
      saveError = rpcResult.error;
      console.warn("[CHAT_FEEDBACK] Authenticated RPC failed; trying admin fallback.", {
        messageId,
        code: rpcResult.error.code,
        message: rpcResult.error.message,
      });

      const adminSupabase = createSupabaseAdminClient();
      const adminResult = await adminSupabase
        .from("chat_messages")
        .update({ feedback: payload.feedback })
        .eq("id", messageId)
        .eq("session_id", existingMessage.session_id)
        .select("id, feedback")
        .maybeSingle<FeedbackRow>();

      data = adminResult.data;
      saveError = adminResult.error;
    } else {
      data = rpcResult.data;
      saveError = null;
    }

    if (saveError || !data) {
      console.error("[CHAT_FEEDBACK] Failed to save feedback.", {
        messageId,
        sessionId: existingMessage.session_id,
        feedback: payload.feedback,
        error: saveError,
      });

      return NextResponse.json(
        {
          error: getSupabaseErrorMessage(saveError) ?? "Failed to save feedback.",
        },
        { status: 500 },
      );
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
