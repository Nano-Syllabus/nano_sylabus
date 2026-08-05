import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  collectionKeyFromOperatorPayload,
  createTeacherFromOperator,
  getTeacherFromOperator,
  regenerateTeacherKeyFromOperator,
  TeacherOperatorApiError,
} from "@/lib/teacher-app/operator";

type RecoveryBody = { recreate?: boolean; confirmation?: string };

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const teacher = await getTeacherProfile();
    if (!teacher || teacher.user_id !== user.id) {
      return NextResponse.json({ error: "Teacher workspace not found." }, { status: 404 });
    }

    let body: RecoveryBody = {};
    try {
      body = await request.json() as RecoveryBody;
    } catch {
      // An empty request is the normal reconnect attempt.
    }

    let keyPayload: Record<string, unknown>;
    let recreated = false;
    try {
      await getTeacherFromOperator(teacher.handle);
      keyPayload = await regenerateTeacherKeyFromOperator(teacher.handle);
    } catch (error) {
      if (!(error instanceof TeacherOperatorApiError) || error.status !== 404) throw error;

      if (!body.recreate || body.confirmation !== "RECREATE") {
        return NextResponse.json(
          {
            error: "This teacher is not present in the currently connected operator tenant.",
            missing: true,
          },
          { status: 409 },
        );
      }

      keyPayload = await createTeacherFromOperator({
        handle: teacher.handle,
        name: typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()
          ? user.user_metadata.full_name
          : user.email?.split("@")[0] || "Teacher",
        email: user.email || `${teacher.handle}@local.invalid`,
      });
      recreated = true;
    }

    const collectionKey = collectionKeyFromOperatorPayload(keyPayload);
    if (!collectionKey) {
      throw new Error("Teacher API did not return the new collection key.");
    }

    const admin = createSupabaseAdminClient();
    const { error: updateError } = await admin
      .from("teachers")
      .update({ collection_sk: collectionKey })
      .eq("id", teacher.id)
      .eq("user_id", user.id);
    if (updateError) throw new Error(`Could not save the repaired workspace key: ${updateError.message}`);

    return NextResponse.json({ recovered: true, recreated });
  } catch (error) {
    const status = error instanceof TeacherOperatorApiError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not reconnect the teacher workspace." },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
}
