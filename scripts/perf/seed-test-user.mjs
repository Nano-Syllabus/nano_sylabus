#!/usr/bin/env node
/**
 * Provisions (or removes) the throwaway account the perf harness signs in with.
 *
 * Every /app screen is behind the auth gate, so there is no way to measure the
 * real thing without a real session. This account exists only for that: it is
 * created with an obviously-disposable address, its credentials are written to
 * the gitignored .env.local, and `--delete` removes it again. `student_profiles`
 * and every other user-owned table cascade from auth.users, so deleting the
 * auth user takes the whole footprint with it.
 *
 *   node scripts/perf/seed-test-user.mjs
 *   node scripts/perf/seed-test-user.mjs --delete
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const ENV_LOCAL = path.join(ROOT, ".env.local");
const MARKER = "perf-audit";

function loadEnvFiles() {
  for (const file of [".env.local", ".env"]) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split("\n")) {
      const match = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/.exec(line);
      if (!match || process.env[match[1]] !== undefined) continue;
      let value = (match[2] ?? "").trim();
      if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  }
}

function upsertEnvLocal(entries) {
  let contents = fs.existsSync(ENV_LOCAL) ? fs.readFileSync(ENV_LOCAL, "utf8") : "";
  for (const [key, value] of Object.entries(entries)) {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(contents)) contents = contents.replace(pattern, `${key}=${value}`);
    else contents += `${contents.endsWith("\n") || !contents ? "" : "\n"}${key}=${value}\n`;
  }
  fs.writeFileSync(ENV_LOCAL, contents);
}

function stripEnvLocal(keys) {
  if (!fs.existsSync(ENV_LOCAL)) return;
  const kept = fs
    .readFileSync(ENV_LOCAL, "utf8")
    .split("\n")
    .filter((line) => !keys.some((key) => line.startsWith(`${key}=`)));
  fs.writeFileSync(ENV_LOCAL, kept.join("\n"));
}

loadEnvFiles();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const deleting = process.argv.includes("--delete");

/** Finds every account this script has ever made, so cleanup cannot miss one. */
async function findPerfUsers() {
  const found = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    found.push(...data.users.filter((user) => (user.email ?? "").includes(MARKER)));
    if (data.users.length < 200) break;
  }
  return found;
}

if (deleting) {
  const users = await findPerfUsers();
  for (const user of users) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    console.log(error ? `failed to delete ${user.email}: ${error.message}` : `deleted ${user.email}`);
  }
  if (!users.length) console.log("no perf-audit accounts found");
  stripEnvLocal(["PERF_TEST_EMAIL", "PERF_TEST_PASSWORD"]);
  console.log("cleared PERF_TEST_* from .env.local");
  process.exit(0);
}

const existing = await findPerfUsers();
if (existing.length && process.env.PERF_TEST_EMAIL && process.env.PERF_TEST_PASSWORD) {
  console.log(`reusing ${process.env.PERF_TEST_EMAIL}`);
  process.exit(0);
}
for (const user of existing) await admin.auth.admin.deleteUser(user.id);

const email = `${MARKER}-${Date.now()}@nano-syllabus-perf.test`;
const password = `Pf-${crypto.randomBytes(18).toString("base64url")}`;

const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "Perf Audit" },
});
if (createError) throw createError;

const { error: profileError } = await admin.from("student_profiles").upsert(
  {
    user_id: created.user.id,
    full_name: "Perf Audit",
    college: "Perf College",
    board: "NEB",
    grade: "12",
    subjects: ["Physics", "Mathematics"],
    target_grade: "A",
    language_pref: "EN",
  },
  { onConflict: "user_id" },
);
if (profileError) throw profileError;

upsertEnvLocal({ PERF_TEST_EMAIL: email, PERF_TEST_PASSWORD: password });
console.log(`created ${email}`);
console.log("credentials written to .env.local (gitignored)");
