import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { drainDriveQueue } from "@/lib/teacher-drive-drain";
import { reconcileDriveIndexes } from "@/lib/teacher-index-reconcile";
import { drainContributions } from "@/lib/data/material-contribution-queue";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Called by the timer, not dependent on an open browser or a live user session. */
export async function POST(request: Request) {
  const secret = process.env.INDEXING_SWEEP_SECRET?.trim();
  if (!secret)
    return NextResponse.json({ error: "Indexing sweep is not configured." }, { status: 503 });
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (
    !timingSafeEqual(digest(request.headers.get("authorization") || ""), digest(`Bearer ${secret}`))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("teacher_drive_imports")
    .select("teacher_id")
    .in("status", ["queued", "importing", "indexing", "retry_wait"])
    .order("updated_at")
    .limit(500);
  if (error) return NextResponse.json({ error: "Could not read import queue." }, { status: 503 });
  const ids = [...new Set((data ?? []).map((row) => row.teacher_id))].slice(0, 3);
  const { data: teachers, error: teacherError } = ids.length
    ? await admin.from("teachers").select("id,collection_sk").in("id", ids)
    : { data: [], error: null };
  if (teacherError)
    return NextResponse.json({ error: "Could not resolve import destinations." }, { status: 503 });
  const results = await Promise.allSettled([
    drainContributions(),
    ...(teachers ?? []).map(async (teacher) => {
      await reconcileDriveIndexes(teacher.collection_sk, teacher.id);
      return drainDriveQueue(teacher.collection_sk, teacher.id);
    }),
  ]);
  const failures = results.filter((result) => result.status === "rejected").length;
  return NextResponse.json({ checked: ids.length, failures }, { status: failures ? 503 : 200 });
}
