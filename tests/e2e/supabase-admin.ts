import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

type TestUser = {
  email: string;
  password: string;
  userId: string;
};

let envCache: Map<string, string> | null = null;

function loadEnvFile(fileName: string) {
  const filePath = join(process.cwd(), fileName);
  if (!existsSync(filePath)) return [] as string[];
  return readFileSync(filePath, "utf8").split(/\r?\n/);
}

function getLocalEnv(key: string) {
  if (!envCache) {
    envCache = new Map<string, string>();
    const lines = [...loadEnvFile(".env.local"), ...loadEnvFile(".env")];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      const [, envKey, rawValue] = match;
      const value = rawValue.replace(/^['"]|['"]$/g, "");
      if (!envCache.has(envKey)) {
        envCache.set(envKey, value);
      }
    }
  }

  return process.env[key] || envCache.get(key) || "";
}

function createAdminClient() {
  const url = getLocalEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getLocalEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for E2E tests.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function assertE2ESchemaReady() {
  const admin = createAdminClient();
  const { error } = await admin
    .from("chat_sessions")
    .select("id, subject_context, subject_tags")
    .limit(0);

  if (error) {
    throw new Error(
      `E2E schema preflight failed: ${error.message}. Run the latest Supabase migrations before running browser E2E.`,
    );
  }
}

export async function createE2ETestUser() {
  const admin = createAdminClient();
  const slug = randomUUID().slice(0, 8);
  const email = `e2e.nano.${slug}@example.com`;
  const password = `NanoE2E!${randomUUID().slice(0, 8)}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: "E2E Nano Student",
    },
  });

  if (error || !data.user) {
    throw new Error(error?.message || "Failed to create E2E test user.");
  }

  return {
    email,
    password,
    userId: data.user.id,
  } satisfies TestUser;
}

export async function deleteE2ETestUser(userId: string) {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(error.message);
  }
}
