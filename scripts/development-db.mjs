import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = ["--yes", "supabase@2.119.0"];
const excluded = "realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor";
process.chdir(root);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8", maxBuffer: 20 * 1024 * 1024, ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message || result.stderr || "see local service logs"}`);
  }
  return result.stdout;
}

try {
  const action = process.argv[2];
  if (action !== "start" && action !== "stop") throw new Error("Use start or stop.");
  const secrets = path.join(root, ".env.google.local");
  const environment = {
    ...process.env,
    ...(existsSync(secrets) ? parseEnv(readFileSync(secrets, "utf8")) : {}),
  };
  run("npx", [...cli, action, "--workdir", "development", ...(action === "start" ? ["-x", excluded] : [])], { env: environment });
  if (action === "stop") {
    console.log("Development database stopped; its Docker volume is retained.");
    process.exit(0);
  }

  const status = JSON.parse(run("npx", [...cli, "status", "--workdir", "development", "-o", "json"], { env: environment }));
  const db = new URL(status.DB_URL);
  if (!["127.0.0.1", "localhost"].includes(db.hostname) || db.port !== "54322") {
    throw new Error("Refusing to initialize a database outside local development.");
  }
  const pgEnv = {
    ...process.env, PGHOST: db.hostname, PGPORT: db.port,
    PGUSER: decodeURIComponent(db.username), PGPASSWORD: decodeURIComponent(db.password),
    PGDATABASE: db.pathname.slice(1), PGSSLMODE: "disable", PGCONNECT_TIMEOUT: "10",
  };
  const query = (sql) => run("psql", ["-X", "-w", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql], { env: pgEnv }).trim();
  const count = Number(query("select count(*) from pg_tables where schemaname='public'"));
  if (count === 0) {
    const backup = path.resolve(root, "../.rollback/supabase-project-migration-2026-10-04");
    const archive = process.env.DEVELOPMENT_SCHEMA_ARCHIVE || path.join(backup, "public-and-history.dump");
    if (!existsSync(archive)) throw new Error("Missing private schema archive. Set DEVELOPMENT_SCHEMA_ARCHIVE to a compatible public-schema dump.");
    const list = run("pg_restore", ["--list", archive]).split("\n").filter((line) =>
      !/; \d+ \d+ SCHEMA - public /.test(line) && !/DEFAULT ACL .*supabase_admin/.test(line),
    ).join("\n");
    // pg_restore's list file contains object names only, never application rows.
    const listFile = path.join(root, "development/supabase/.temp/development-restore.list");
    writeFileSync(listFile, list, { mode: 0o600 });
    const schema = run("pg_restore", ["--schema-only", "--schema=public", "--no-owner", "--file=-", "--use-list", listFile, archive]);
    const grants = readFileSync(path.join(backup, "source-object-grants.sql"), "utf8");
    const triggers = readFileSync(path.join(backup, "auth-custom-triggers.sql"), "utf8");
    run("psql", ["-X", "-w", "-v", "ON_ERROR_STOP=1"], {
      env: pgEnv,
      input: `BEGIN;\nSET LOCAL lock_timeout='10s';\nCREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;\n${schema}\n${grants}\nSET search_path=public,pg_catalog;\n${triggers}\nNOTIFY pgrst, 'reload schema';\nCOMMIT;\n`,
    });
    console.log("Installed the development schema without application records, accounts or Storage objects.");
  }

  const base = parseEnv(readFileSync(path.join(root, ".env"), "utf8"));
  const stagingUrl = base.NEXT_PUBLIC_SUPABASE_URL;
  if (new URL(stagingUrl).origin === new URL(status.API_URL).origin) throw new Error("Development and staging databases must differ.");
  const existingFile = path.join(root, ".env.development.local");
  const existing = existsSync(existingFile) ? parseEnv(readFileSync(existingFile, "utf8")) : {};
  const config = {
    ...base, ...existing,
    NEXT_PUBLIC_APP_ENV: "development",
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY || status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_DEVELOPMENT_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_STAGING_SUPABASE_URL: stagingUrl,
    NEXT_PUBLIC_ENABLE_GOOGLE_AUTH: existing.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH || "false",
    VPS_STORAGE_PATH_PREFIX: "development",
  };
  writeFileSync(existingFile, Object.entries(config).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { mode: 0o600 });
  console.log(`Development ready at ${status.API_URL}; run npm run dev. Staging uses a separate hosted database.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
