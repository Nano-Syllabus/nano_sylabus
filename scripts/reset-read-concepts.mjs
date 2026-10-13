// Uses exactly the environment explicitly loaded by Node: no implicit .env.local override.
// node --env-file=.env scripts/reset-read-concepts.mjs [--apply]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  CONCEPT_READING_VERSION,
  resetSavedConceptReading,
  resetPooledConceptReading,
} from "../lib/concept-reading-version.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error("Load the intended environment with --env-file before running this script.");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const apply = process.argv.includes("--apply");
const output = path.resolve(
  process.env.CONCEPT_RESET_OUTPUT || `test-results/read-concepts-reset-${Date.now()}`,
);
await mkdir(output, { recursive: true, mode: 0o700 });
const save = (name, data) =>
  writeFile(path.join(output, name), JSON.stringify(data), { mode: 0o600 });

async function rows(table, columns) {
  const all = [];
  for (let from = 0; ; from += 500) {
    const result = await db
      .from(table)
      .select(columns)
      .order("id")
      .range(from, from + 499);
    if (result.error) throw new Error(`${table}: ${result.error.code}`);
    all.push(...result.data);
    if (result.data.length < 500) return all;
  }
}
const [challenges, pool, teachers] = await Promise.all([
  rows("student_challenges", "id,content,updated_at,status"),
  rows(
    "challenge_topic_pool",
    "id,content,manifest,updated_at,status,teacher_id,subject_name,topic_key,topic_title",
  ),
  rows("teachers", "id,handle"),
]);
const affected = challenges.filter(
  (r) =>
    r.content?.provider === "collection-challenge-v1" &&
    (r.content?.lesson?.content?.length ||
      r.content?.romanNepali?.reading?.length ||
      r.content?.readingError),
);
const pooled = pool.filter((r) => r.content?.reading);
const collections = teachers.map(
  (r) =>
    `${String(r.handle)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}-teacher`,
);
await save("collections.json", collections);
await save("student-readings-backup.json", affected);
await save("pooled-readings-backup.json", pooled);
await save(
  "topics.json",
  pool
    .filter((r) => r.content?.reading)
    .map(({ teacher_id, subject_name, topic_key, topic_title }) => ({
      teacher_id,
      subject_name,
      topic_key,
      topic_title,
    })),
);
console.log(
  JSON.stringify({
    project: new URL(url).hostname,
    apply,
    studentReadings: affected.length,
    pooledReadings: pooled.length,
    collections: collections.length,
    version: CONCEPT_READING_VERSION,
    backupDirectory: output,
  }),
);
if (!apply) process.exit(0);

const counts = { studentReadingsCleared: 0, pooledReadingsCleared: 0, conflicts: 0 };
async function update(table, row, patch) {
  // A concurrently submitted answer must win over this maintenance read.
  const result = await db
    .from(table)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("updated_at", row.updated_at)
    .select("id");
  if (result.error) throw new Error(`${table}: ${result.error.code}`);
  return result.data.length === 1;
}
for (const row of affected) {
  const content = resetSavedConceptReading(row.content);
  if (!content) continue;
  if (await update("student_challenges", row, { content })) counts.studentReadingsCleared++;
  else counts.conflicts++;
}
for (const row of pooled) {
  const patch = {
    content: resetPooledConceptReading(row.content),
    manifest: row.manifest ? { ...row.manifest, has_reading: false } : null,
    ...(row.status === "ready"
      ? { status: "stale", next_attempt_at: new Date().toISOString() }
      : {}),
  };
  if (await update("challenge_topic_pool", row, patch)) counts.pooledReadingsCleared++;
  else counts.conflicts++;
}
// Read back the actual database, not the write responses.
const [current, currentPool] = await Promise.all([
  rows("student_challenges", "id,content,status"),
  rows("challenge_topic_pool", "id,content,status"),
]);
const remainingOldStudentReadings = current.filter(
  (r) =>
    r.content?.lesson?.content?.length &&
    r.content.lesson.readingVersion !== CONCEPT_READING_VERSION,
).length;
const remainingOldPooledReadings = currentPool.filter(
  (r) => r.content?.reading && r.content.reading.content_version !== CONCEPT_READING_VERSION,
).length;
const report = {
  ...counts,
  remainingOldStudentReadings,
  remainingOldPooledReadings,
  studentHistoryPreserved:
    JSON.stringify(current.map((r) => [r.id, r.status])) ===
    JSON.stringify(challenges.map((r) => [r.id, r.status])),
};
await save("report.json", report);
console.log(JSON.stringify(report));
if (remainingOldStudentReadings || remainingOldPooledReadings) process.exitCode = 2;
