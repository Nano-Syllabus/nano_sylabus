// Read-only production/local-environment check. Never prints user data or keys.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing local Supabase configuration; no database changes made.");
  process.exitCode = 1;
} else {
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc("get_platform_admin_analytics").abortSignal(AbortSignal.timeout(15_000));
  if (error) {
    console.error(`Analytics RPC unavailable (${error.code || "connection error"}). Apply 20260828120000_platform_admin_analytics.sql to this environment, then retry. No database changes made.`);
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({
      verified: true, generatedAt: data.generatedAt, timezone: data.timezone,
      users: data.users?.total, subjects: data.content?.subjects, courses: data.content?.courses,
      challengesPassed: data.challenges?.passed, examsCompleted: data.exams?.completed,
      requestsRecorded: data.requests?.recorded, revenueCurrencies: data.revenue?.currencies?.map(item => item.currency),
    }, null, 2));
  }
  const adminCount = await db.from("student_profiles").select("user_id", { head: true, count: "exact" }).in("role", ["admin", "super_admin"]);
  console.log(adminCount.error ? "Could not verify administrator count." : `Administrator accounts configured: ${adminCount.count}`);
}
