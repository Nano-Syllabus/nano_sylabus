// Copies unit names from the backend catalogue onto `community_subject_topics`.
//
// The revision docs name a unit ("Unit 1 · Basic Circuit Concepts") from this
// table, and every row synced before the `unit_title` column existed has ''. A
// creator's "refresh topics" would fill a subject, and would also re-parse its
// syllabus (`refresh=true`), which can re-key topics. This only reads the stored
// catalogue (no refresh) and writes the one column, on rows that have none.
//
// Order: deploy the backend, run `backfill_unit_titles` there, apply the
// 20260922130000 migration, then this.
//
//   node scripts/backfill-topic-unit-titles.mjs            # dry run: prints what it would fill
//   node scripts/backfill-topic-unit-titles.mjs --apply    # writes
//   node scripts/backfill-topic-unit-titles.mjs --subject "Engineering Physics" [--apply]
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import https from "node:https";
import http from "node:http";

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const onlySubject = args.includes("--subject") ? (args[args.indexOf("--subject") + 1] ?? "").trim() : "";
const baseUrl = process.env.TENANT_API_BASE_URL;
const rejectUnauthorized = (process.env.TENANT_API_REJECT_UNAUTHORIZED || "0").trim() === "1";
if (!baseUrl) throw new Error("TENANT_API_BASE_URL is not set.");

/** The stored catalogue, as the app reads it — never `refresh=true`. */
function storedCatalogue(collectionSk, subject) {
  const url = new URL("/api/v1/practice/topics", baseUrl);
  url.searchParams.set("subject", subject);
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.get(
      url,
      { rejectUnauthorized, headers: { Authorization: `Bearer ${collectionSk}`, Accept: "application/json" } },
      (response) => {
        let body = "";
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => {
          if ((response.statusCode ?? 500) >= 400) return reject(new Error(`HTTP ${response.statusCode}`));
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.setTimeout(60000, () => request.destroy(new Error("timed out")));
    request.on("error", reject);
  });
}

const probe = await db.from("community_subject_topics").select("unit_title").limit(1);
if (probe.error) {
  throw new Error(`community_subject_topics.unit_title is not readable — apply the migration first (${probe.error.message})`);
}

let query = db.from("community_subjects").select("id,name,teacher_id").eq("status", "active");
if (onlySubject) query = query.eq("name", onlySubject);
const subjects = await query;
if (subjects.error) throw subjects.error;
const teacherIds = [...new Set((subjects.data ?? []).map((row) => row.teacher_id).filter(Boolean))];
const teachers = teacherIds.length
  ? await db.from("teachers").select("id,collection_sk").in("id", teacherIds)
  : { data: [], error: null };
if (teachers.error) throw teachers.error;
const collectionFor = new Map((teachers.data ?? []).map((row) => [row.id, row.collection_sk]));

let filled = 0;
let unchanged = 0;
let failed = 0;
// One subject at a time: the practice-topics route is the one a fan-out once
// starved, and this has no deadline.
for (const subject of subjects.data ?? []) {
  const empty = await db
    .from("community_subject_topics")
    .select("topic_key")
    .eq("community_subject_id", subject.id)
    .eq("unit_title", "");
  if (empty.error) throw empty.error;
  if (!empty.data?.length) continue;
  const collectionSk = collectionFor.get(subject.teacher_id);
  if (!collectionSk) {
    console.log(`skip  ${subject.name}: its teacher has no collection`);
    failed += 1;
    continue;
  }
  let catalogue;
  try {
    catalogue = await storedCatalogue(collectionSk, subject.name);
  } catch (error) {
    console.log(`skip  ${subject.name}: catalogue unavailable (${error.message})`);
    failed += 1;
    continue;
  }
  const titleByKey = new Map(
    (catalogue.topics ?? [])
      .filter((topic) => typeof topic.unit_title === "string" && topic.unit_title.trim())
      .map((topic) => [String(topic.topic_key), topic.unit_title.trim()]),
  );
  const byTitle = new Map();
  for (const { topic_key: key } of empty.data) {
    const title = titleByKey.get(key);
    if (title) byTitle.set(title, [...(byTitle.get(title) ?? []), key]);
  }
  if (!byTitle.size) {
    console.log(`none  ${subject.name}: the backend catalogue has no unit names for it yet`);
    unchanged += 1;
    continue;
  }
  for (const [title, keys] of byTitle) {
    console.log(`${apply ? "fill" : "would fill"}  ${subject.name}: ${keys.length} topic(s) → ${JSON.stringify(title)}`);
    if (!apply) continue;
    const update = await db
      .from("community_subject_topics")
      .update({ unit_title: title })
      .eq("community_subject_id", subject.id)
      .eq("unit_title", "")
      .in("topic_key", keys);
    if (update.error) throw update.error;
  }
  filled += 1;
}

console.log(
  `\n${filled} subject(s) ${apply ? "filled" : "to fill (dry run — pass --apply to write)"}, ` +
    `${unchanged} with no names yet, ${failed} skipped`,
);
