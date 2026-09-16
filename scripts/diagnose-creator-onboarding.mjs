// Read-only. Why "Activate creator workspace" fails for one account.
// Prints no keys: a collection key is reported as present/absent only.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email) {
  console.error("usage: node scripts/diagnose-creator-onboarding.mjs <email>");
  process.exit(1);
}

let user = null;
for (let page = 1; page <= 20 && !user; page += 1) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  user = data.users.find((u) => (u.email ?? "").toLowerCase() === email) ?? null;
  if (!data.users.length) break;
}
if (!user) {
  console.error(`No account for ${email}`);
  process.exit(1);
}

console.log(`user_id: ${user.id}`);

// 1. Does a teachers row already exist for this account? If so the action
//    returns early and never calls the provider.
const mine = await db
  .from("teachers")
  .select("id,handle,collection_sk,user_id")
  .eq("user_id", user.id)
  .maybeSingle();
console.log(
  `teachers row for this user: ${mine.data ? `yes  handle=${mine.data.handle}  collection key ${mine.data.collection_sk ? "present" : "MISSING"}` : "none"}`,
);
if (mine.error) console.log(`  read error: ${mine.error.code} ${mine.error.message}`);

// 2. The handle the action would mint. A collision with ANOTHER user's row is a
//    unique-constraint failure at the very last step, after the provider has
//    already created the collection.
const prefix = (user.email?.split("@")[0] ?? "").replace(/[^a-zA-Z0-9]/g, "") || "teacher";
const handle = `${prefix}_${user.id.slice(0, 5)}`;
console.log(`handle it would mint: ${handle}`);
const clash = await db.from("teachers").select("user_id,handle").eq("handle", handle);
const foreign = (clash.data ?? []).filter((row) => row.user_id !== user.id);
console.log(`rows already holding that handle, owned by someone else: ${foreign.length}`);

// 3. Environment the action depends on, presence only.
for (const name of ["TENANT_API_BASE_URL", "TENANT_API_TOKEN", "TEACHER_APP_API_TOKEN"]) {
  const value = process.env[name];
  console.log(`${name}: ${value ? (name.endsWith("URL") ? value : "present") : "MISSING"}`);
}
console.log(
  `TENANT_API_REJECT_UNAUTHORIZED=${process.env.TENANT_API_REJECT_UNAUTHORIZED ?? "(unset -> 0)"}`,
);
