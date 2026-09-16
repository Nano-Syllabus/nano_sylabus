// Read-only. Why a subject shows no challenges: is it the topic catalogue, or
// the daily allowance? Prints counts only, never a student's answers.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const args = process.argv.slice(2);
const flag = (n) => {
  const at = args.indexOf(`--${n}`);
  return at === -1 ? null : (args[at + 1] ?? "").trim();
};
const subjectSlug = flag("subject");
const courseId = flag("courseId");

// 1. Does the catalogue actually offer anything for this subject?
const subjects = await db
  .from("community_subjects")
  .select("id,name,external_subject_slug,community_id,status,publication_status")
  .eq("external_subject_slug", subjectSlug);
console.log(`community_subjects for ${subjectSlug}: ${subjects.data?.length ?? 0}`);
for (const s of subjects.data ?? []) {
  const topics = await db
    .from("community_subject_topics")
    .select("topic_key,title,unit_number,position")
    .eq("community_subject_id", s.id)
    .order("position", { ascending: true });
  console.log(
    `  ${s.name}  status=${s.status} published=${s.publication_status}  topics=${topics.data?.length ?? 0}`,
  );
  for (const t of (topics.data ?? []).slice(0, 8)) {
    console.log(`     unit ${String(t.unit_number ?? "-").padStart(2)}  ${t.title}`);
  }
  if ((topics.data?.length ?? 0) > 8) console.log(`     … ${topics.data.length - 8} more`);
}

// 2. Today's rows — the daily allowance is counted per challenge_date.
const today = new Date().toISOString().slice(0, 10);
for (const date of [today]) {
  let q = db
    .from("student_challenges")
    .select("user_id,subject_name,topic_title,status,challenge_date")
    .eq("challenge_date", date);
  if (courseId) q = q.eq("course_id", courseId);
  const { data } = await q;
  const byUser = new Map();
  for (const row of data ?? []) {
    byUser.set(row.user_id, (byUser.get(row.user_id) ?? 0) + 1);
  }
  console.log(`\nRows dated ${date}: ${data?.length ?? 0} across ${byUser.size} student(s)`);
  const atCap = [...byUser.values()].filter((n) => n >= 3).length;
  console.log(`  students already at the free 3/day allowance: ${atCap}`);
}
