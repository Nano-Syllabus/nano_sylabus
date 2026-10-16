import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { requestConceptExplainer } from "@/lib/data/concept-explainer";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * Make sure every topic with a reading has its explainer video (user,
 * 2026-10-16: "make sure the video is ready"). New readings queue their own
 * video as they are filed (`prepareExplainer` in lib/data/student-challenges);
 * this catches up the ones written before that.
 *
 * One challenge row stands for each topic: the video is content-addressed
 * upstream, so any student's row of the topic asks for the same render. Asking
 * again for a topic already queued or made is free — it just reports status —
 * so a caller pages through with `offset`/`limit` and re-asks to watch one
 * finish. Renders are `background`: the renderer declines them first when busy.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const expected = secret ? `Bearer ${secret}` : "";
  if (
    !expected ||
    authorization.length !== expected.length ||
    !timingSafeEqual(Buffer.from(authorization), Buffer.from(expected))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const limit = Math.min(10, Math.max(1, Number(url.searchParams.get("limit")) || 3));

  const admin = createSupabaseAdminClient();
  const seen = new Set<string>();
  const topics: { id: string; userId: string; title: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("student_challenges")
      .select("id,user_id,course_id,subject_slug,topic_key,topic_title,first:content->lesson->content->0")
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const row of data ?? []) {
      const r = row as Record<string, unknown>;
      if (!r.first) continue;
      const key = `${r.course_id ?? ""}:${String(r.subject_slug ?? "").toLowerCase()}:${r.topic_key ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      topics.push({ id: String(r.id), userId: String(r.user_id), title: String(r.topic_title ?? "") });
    }
    if (!data || data.length < 1000) break;
  }

  const results = [];
  for (const topic of topics.slice(offset, offset + limit)) {
    try {
      const explainer = await requestConceptExplainer(topic.userId, topic.id, "background");
      results.push({ topic: topic.title, hash: explainer?.hash ?? "", status: explainer?.status ?? "missing", error: explainer?.error ?? "" });
    } catch (error) {
      results.push({ topic: topic.title, hash: "", status: "skipped", error: error instanceof Error ? error.message : String(error) });
    }
  }
  return NextResponse.json(
    { total: topics.length, offset, results },
    { headers: { "Cache-Control": "no-store" } },
  );
}
