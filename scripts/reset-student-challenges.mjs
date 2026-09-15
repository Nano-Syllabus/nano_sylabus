/**
 * Clears student challenge rows so they are reassigned from the CURRENT
 * subtopic catalogue.
 *
 * WHY CLEARING IS THE FIX AND NOT A WORKAROUND
 * --------------------------------------------
 * A challenge stores its lesson, past questions, worked examples and exam on the
 * row at `/start`, and never rebuilds them — reopening one is meant to hand back
 * the reading the student was already given. That durability is correct, and it
 * is also why two classes of bad row cannot heal themselves:
 *
 *   stale TOPIC      assigned against a unit ("Oscillation", "Introduction")
 *                    before the syllabus was re-read into its own subtopics.
 *   stale CONTENT    written when the reading service was unreachable, so the
 *                    lesson is an internal diagnostic and a wall of raw note
 *                    scaffolding rather than a reading.
 *
 * Nothing in the app rewrites either. Clearing the rows is what lets the current
 * parser and the current reading builder produce them properly.
 *
 * WHAT IS LOST, SAID PLAINLY
 * --------------------------
 * Completed challenges are the record of what a student has passed. Removing
 * them resets that history, and the revision docs built from it, permanently.
 * Graded practice attempts in `student_practice_attempts` are separate rows and
 * are NOT touched, so scores survive even where the challenge that produced one
 * does not.
 *
 * USAGE
 *   node scripts/reset-student-challenges.mjs                    # report only
 *   node scripts/reset-student-challenges.mjs --email a@b.com    # scope to one student
 *   node scripts/reset-student-challenges.mjs --subject "Engineering Physics"
 *   node scripts/reset-student-challenges.mjs --topic Oscillation
 *   node scripts/reset-student-challenges.mjs --unfinished       # keep completed rows
 *   node scripts/reset-student-challenges.mjs --confirm          # apply
 *
 * `--subject` matches the slug or the display name; `--topic` matches the topic
 * title exactly. Pair them for a unit name that repeats across subjects — three
 * different courses list a topic called "Introduction".
 *
 * A report is the default and prints exactly what `--confirm` would act on.
 */
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase configuration; no database changes made.");
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? null : (args[at + 1] ?? "").trim();
};
const confirm = args.includes("--confirm");
const unfinishedOnly = args.includes("--unfinished");
const email = flag("email");
const subject = flag("subject");
const topic = flag("topic");

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let userId = null;
if (email) {
  // `listUsers` is paginated; a deployment with many users needs the page the
  // address is actually on, so walk until it is found rather than assuming page 1.
  for (let page = 1; page <= 20 && !userId; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error(`Could not look up ${email}: ${error.message}. No database changes made.`);
      process.exit(1);
    }
    userId = data.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase())?.id ?? null;
    if (!data.users.length) break;
  }
  if (!userId) {
    console.error(`No account for ${email}. No database changes made.`);
    process.exit(1);
  }
}

const scoped = (query) => {
  let q = query;
  if (userId) q = q.eq("user_id", userId);
  // Slug OR display name: the report below prints names, and retyping a slug
  // from a name is a step where a wrong guess quietly widens the scope.
  if (subject) q = q.or(`subject_slug.eq.${subject},subject_name.eq.${subject}`);
  if (topic) q = q.eq("topic_title", topic);
  if (unfinishedOnly) q = q.neq("status", "completed");
  return q;
};

const preview = await scoped(
  db.from("student_challenges").select("id,subject_name,topic_title,status"),
);
if (preview.error) {
  console.error(
    `Could not read student_challenges: ${preview.error.message}. No database changes made.`,
  );
  process.exit(1);
}

const rows = preview.data ?? [];
const byStatus = rows.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {});
const byTopic = new Map();
for (const row of rows) {
  const label = `${row.subject_name} — ${row.topic_title}`;
  byTopic.set(label, (byTopic.get(label) ?? 0) + 1);
}

console.log(
  `Scope: ${email ?? "all students"}` +
    `${subject ? `, subject ${subject}` : ""}` +
    `${topic ? `, topic ${topic}` : ""}` +
    `${unfinishedOnly ? ", unfinished only" : ""}`,
);
console.log(`Rows matched: ${rows.length}  ${JSON.stringify(byStatus)}`);
for (const [label, count] of [...byTopic.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  console.log(`  ${String(count).padStart(4)}  ${label}`);
}
if (byTopic.size > 25) console.log(`  … and ${byTopic.size - 25} more topics`);

if (!rows.length) {
  console.log("\nNothing matched.");
  process.exit(0);
}
if (!confirm) {
  console.log("\nReport only — no database changes made. Re-run with --confirm to apply.");
  process.exit(0);
}

// Acted on by explicit id list: a filtered statement would re-evaluate its own
// predicate against whatever the table holds at execution time, which is not
// necessarily the set just printed and approved.
const ids = rows.map((row) => row.id);
let cleared = 0;
for (let at = 0; at < ids.length; at += 200) {
  const batch = ids.slice(at, at + 200);
  const { error } = await db.from("student_challenges").delete().in("id", batch);
  if (error) {
    console.error(`\nStopped after ${cleared} row(s): ${error.message}`);
    process.exit(1);
  }
  cleared += batch.length;
}
console.log(
  `\nCleared ${cleared} challenge row(s). The next Challenge Hub visit assigns fresh ones ` +
    `from the current subtopic catalogue.`,
);
