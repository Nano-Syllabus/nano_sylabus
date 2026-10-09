// Re-reads every subject of one faculty from its syllabus and rewrites the
// app's topic snapshot (`community_subject_topics`) to match — steps 1 and 2 of
// the subtopic re-index (the question-bank re-file and the answer warm-up run
// on the backend box afterwards).
//
// Same rows the creator's "Refresh" writes (`syncCommunitySubjectTopics`), but
// without re-queuing members' daily challenges: students keep the cards they
// have, and new topics join their queue as usual.
//
//   node scripts/reindex-faculty-topics.mjs --faculty bsc-csit            # dry run: diff only
//   node scripts/reindex-faculty-topics.mjs --faculty bsc-csit --apply    # refresh + write
//
// The dry run reads the STORED catalogue; --apply asks the backend to re-parse
// (`refresh=true`) first, which is what applies a new split rule.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { createJiti } from "jiti";
import https from "node:https";
import http from "node:http";
import path from "node:path";

// Production env (.env.local), not the local dev database.
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const jiti = createJiti(import.meta.url, { alias: { "@": path.resolve(".") } });
const { isChallengeSourceDocumentTopic } = await jiti.import(path.resolve("lib/challenge-topics.ts"));

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const facultySlug = args.includes("--faculty") ? (args[args.indexOf("--faculty") + 1] ?? "").trim() : "";
if (!facultySlug) throw new Error("Pass --faculty <slug>.");
const baseUrl = process.env.TENANT_API_BASE_URL;
const rejectUnauthorized = (process.env.TENANT_API_REJECT_UNAUTHORIZED || "0").trim() === "1";
if (!baseUrl) throw new Error("TENANT_API_BASE_URL is not set.");

function catalogue(collectionSk, subject, refresh) {
  const url = new URL("/api/v1/practice/topics", baseUrl);
  url.searchParams.set("subject", subject);
  if (refresh) url.searchParams.set("refresh", "true");
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.get(
      url,
      { rejectUnauthorized, headers: { Authorization: `Bearer ${collectionSk}`, Accept: "application/json" } },
      (response) => {
        let body = "";
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => {
          if ((response.statusCode ?? 500) >= 400) return reject(new Error(`HTTP ${response.statusCode}: ${body.slice(0, 200)}`));
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.setTimeout(180000, () => request.destroy(new Error("timed out")));
    request.on("error", reject);
  });
}

/** Mirrors `extractedLearningTopics` in lib/data/community-learning-topics.ts. */
function learningTopics(payload) {
  if (!Array.isArray(payload?.topics)) throw new Error("No topic catalogue returned.");
  const seen = new Set();
  return payload.topics.flatMap((row, index) => {
    const title = typeof row?.title === "string" ? row.title.trim() : "";
    const key = typeof row?.topic_key === "string" ? row.topic_key.trim() : "";
    if (!title || !key) throw new Error("A topic without a usable ID or title.");
    if (isChallengeSourceDocumentTopic({ topicKey: key, title, subjectName: typeof payload.subject === "string" ? payload.subject : "" })) return [];
    if (seen.has(key)) return [];
    seen.add(key);
    const position = Number(row.order_index ?? index);
    return [{
      topic_key: key,
      title,
      blurb: typeof row.blurb === "string" ? row.blurb.trim() : "",
      unit_number: row.unit_number == null ? null : String(row.unit_number),
      unit_title: typeof row.unit_title === "string" ? row.unit_title.trim() : "",
      position: Number.isFinite(position) ? Math.max(0, Math.floor(position)) : index,
      source: typeof payload.topic_source === "string" ? payload.topic_source : "indexed_material",
    }];
  });
}

const faculty = await db.from("communities").select("id,name,slug").eq("slug", facultySlug).maybeSingle();
if (faculty.error || !faculty.data) throw new Error(`Faculty ${facultySlug} not found.`);
const subjects = await db
  .from("community_subjects")
  .select("id,name,external_subject_slug,teacher_id")
  .eq("community_id", faculty.data.id)
  .eq("status", "active")
  .order("name");
if (subjects.error) throw subjects.error;
console.log(`${faculty.data.name}: ${subjects.data.length} subjects${apply ? "" : " (dry run)"}`);

const keys = new Map();
const summary = [];
for (const subject of subjects.data) {
  if (!subject.external_subject_slug) {
    summary.push(`- ${subject.name}: skipped (no learning space)`);
    continue;
  }
  if (!keys.has(subject.teacher_id)) {
    const teacher = await db.from("teachers").select("collection_sk").eq("id", subject.teacher_id).maybeSingle();
    keys.set(subject.teacher_id, teacher.data?.collection_sk ?? null);
  }
  const sk = keys.get(subject.teacher_id);
  if (!sk) {
    summary.push(`- ${subject.name}: skipped (creator has no collection key)`);
    continue;
  }
  try {
    const topics = learningTopics(await catalogue(sk, subject.external_subject_slug, apply));
    const existing = await db.from("community_subject_topics").select("id,topic_key").eq("community_subject_id", subject.id);
    if (existing.error) throw existing.error;
    const fresh = new Set(topics.map((topic) => topic.topic_key));
    const old = new Set((existing.data ?? []).map((row) => row.topic_key));
    const added = topics.filter((topic) => !old.has(topic.topic_key));
    const stale = (existing.data ?? []).filter((row) => !fresh.has(row.topic_key));
    if (!topics.length) {
      summary.push(`- ${subject.name}: backend returned no topics — kept ${old.size} existing`);
      continue;
    }
    if (apply) {
      const now = new Date().toISOString();
      const upsert = await db
        .from("community_subject_topics")
        .upsert(topics.map((topic) => ({ community_subject_id: subject.id, ...topic, updated_at: now })), {
          onConflict: "community_subject_id,topic_key",
        });
      if (upsert.error) throw upsert.error;
      if (stale.length) {
        const removed = await db.from("community_subject_topics").delete().in("id", stale.map((row) => row.id));
        if (removed.error) throw removed.error;
      }
      const status = await db
        .from("community_subjects")
        .update({ topic_sync_status: "ready", topic_synced_at: now, topic_sync_error: null })
        .eq("id", subject.id);
      if (status.error) throw status.error;
    }
    summary.push(
      `- ${subject.name} [${subject.external_subject_slug}]: ${topics.length} topics (+${added.length} new, -${stale.length} retired)` +
        (added.length ? `\n    new: ${added.slice(0, 6).map((topic) => topic.title).join(" | ")}${added.length > 6 ? " …" : ""}` : ""),
    );
  } catch (error) {
    summary.push(`- ${subject.name}: FAILED — ${error instanceof Error ? error.message : error}`);
  }
}
console.log(summary.join("\n"));
