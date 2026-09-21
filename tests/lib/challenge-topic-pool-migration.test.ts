import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260921200000_challenge_topic_pool.sql",
);

/**
 * The global challenge pool's table and its claim.
 *
 * The claim is the whole concurrency story: the VPS timer and a sweep kicked
 * from a request can run at the same time, and neither may prepare a topic the
 * other already holds. So it is exercised against a real Postgres here rather
 * than trusted from the TypeScript that calls it.
 */
describe("challenge topic pool migration", () => {
  let db: PGlite;
  const course = "11111111-1111-4111-8111-111111111111";
  const teacher = "22222222-2222-4222-8222-222222222222";

  // One database for the file — a PGlite start is the expensive part, and the
  // suite runs several of them in parallel — emptied between tests.
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create table public.teacher_courses (id uuid primary key);
      create table public.teachers (id uuid primary key);
      create table public.community_subjects (id uuid primary key);
      insert into public.teacher_courses values ('${course}');
      insert into public.teachers values ('${teacher}');
    `);
    await db.exec(await readFile(migrationPath, "utf8"));
  }, 30_000);

  beforeEach(async () => {
    await db.exec("delete from public.challenge_topic_pool");
  });

  afterAll(async () => db.close());

  async function topic(key: string, values: Record<string, string | number | null> = {}) {
    const columns = [
      "course_id",
      "teacher_id",
      "subject_slug",
      "topic_key",
      ...Object.keys(values),
    ];
    const params = [course, teacher, "teacher_nims", key, ...Object.values(values)];
    await db.query(
      `insert into public.challenge_topic_pool (${columns.join(",")})
       values (${columns.map((_, index) => `$${index + 1}`).join(",")})`,
      params,
    );
  }

  async function claim(owner: string, limit = 6, leaseSeconds = 180) {
    const result = await db.query<{
      topic_key: string;
      prior_status: string;
      status: string;
      lease_owner: string;
    }>("select * from public.claim_challenge_topic_pool($1, $2, $3)", [owner, limit, leaseSeconds]);
    return result.rows;
  }

  it("claims the highest priority first, then syllabus order", async () => {
    await topic("later", { position: 5, priority: 20 });
    await topic("first", { position: 0, priority: 20 });
    await topic("urgent", { position: 9, priority: 40 });
    await topic("background", { position: 1, priority: 0 });

    const rows = await claim("sweep-a", 3);
    expect(rows.map((row) => row.topic_key)).toEqual(["urgent", "first", "later"]);
    expect(rows.every((row) => row.status === "building" && row.lease_owner === "sweep-a")).toBe(
      true,
    );
    expect(rows.map((row) => row.prior_status)).toEqual(["queued", "queued", "queued"]);
  });

  it("never hands a leased topic to a second sweep", async () => {
    await topic("one", { position: 0 });
    await topic("two", { position: 1 });

    const first = await claim("sweep-a", 1);
    const second = await claim("sweep-b", 6);
    const third = await claim("sweep-c", 6);

    expect(first.map((row) => row.topic_key)).toEqual(["one"]);
    expect(second.map((row) => row.topic_key)).toEqual(["two"]);
    expect(third).toEqual([]);
  });

  it("takes over a lapsed lease, and a failed row only once its backoff is over", async () => {
    await topic("lapsed", { status: "building", lease_owner: "dead-sweep" });
    await db.query(
      "update public.challenge_topic_pool set lease_expires_at = now() - interval '1 minute' where topic_key = 'lapsed'",
    );
    await topic("held", { status: "building", lease_owner: "live-sweep" });
    await db.query(
      "update public.challenge_topic_pool set lease_expires_at = now() + interval '1 minute' where topic_key = 'held'",
    );
    await topic("backing-off", { status: "failed", attempts: 2 });
    await db.query(
      "update public.challenge_topic_pool set next_attempt_at = now() + interval '4 minutes' where topic_key = 'backing-off'",
    );
    await topic("retry-now", { status: "failed", attempts: 1 });
    await db.query(
      "update public.challenge_topic_pool set next_attempt_at = now() - interval '1 second' where topic_key = 'retry-now'",
    );
    await topic("parked", { status: "queued" });
    await db.query(
      "update public.challenge_topic_pool set next_attempt_at = now() + interval '15 minutes' where topic_key = 'parked'",
    );
    await topic("stale", { status: "stale" });
    await topic("ready", { status: "ready" });
    await topic("unavailable", { status: "unavailable" });

    const rows = await claim("sweep-a");
    expect(rows.map((row) => row.topic_key).sort()).toEqual(["lapsed", "retry-now", "stale"]);
    expect(Object.fromEntries(rows.map((row) => [row.topic_key, row.prior_status]))).toEqual({
      lapsed: "building",
      "retry-now": "failed",
      stale: "stale",
    });
  });

  it("holds one row per course, subject and topic", async () => {
    await topic("one");
    await expect(topic("one")).rejects.toThrow();
    await expect(topic("bad", { status: "done" })).rejects.toThrow();
  });

  it("is for the service role only", async () => {
    const privileges = await db.query<{ role: string; execute: boolean; read: boolean }>(`
      select role,
        has_function_privilege(role, 'public.claim_challenge_topic_pool(text, integer, integer)', 'execute') as execute,
        has_table_privilege(role, 'public.challenge_topic_pool', 'select') as read
      from unnest(array['anon', 'authenticated', 'service_role']) as role
    `);
    expect(privileges.rows).toEqual([
      { role: "anon", execute: false, read: false },
      { role: "authenticated", execute: false, read: false },
      { role: "service_role", execute: true, read: false },
    ]);
    const rls = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where oid = 'public.challenge_topic_pool'::regclass",
    );
    expect(rls.rows[0].relrowsecurity).toBe(true);
    const policies = await db.query(
      "select * from pg_policies where tablename = 'challenge_topic_pool'",
    );
    expect(policies.rows).toEqual([]);
  });

  it("can be applied twice", async () => {
    await topic("kept", { status: "ready" });
    await db.exec(await readFile(migrationPath, "utf8"));
    const rows = await db.query("select topic_key, status from public.challenge_topic_pool");
    expect(rows.rows).toEqual([{ topic_key: "kept", status: "ready" }]);
  });

  it("pins the clauses the sweep depends on", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toMatch(/create table if not exists public\.challenge_topic_pool/);
    expect(sql).toMatch(/course_id uuid not null references public\.teacher_courses\(id\)/);
    expect(sql).toMatch(
      /check \(status in \('queued', 'building', 'ready', 'stale', 'failed', 'unavailable'\)\)/,
    );
    expect(sql).toMatch(/unique \(course_id, subject_slug, topic_key\)/);
    expect(sql).toMatch(/on public\.challenge_topic_pool \(status, priority desc, position\)/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).toMatch(/create or replace function public\.claim_challenge_topic_pool/);
    expect(sql).toMatch(/for update skip locked/);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(
      /grant execute on function public\.claim_challenge_topic_pool\(text, integer, integer\)\s+to service_role/,
    );
    expect(sql).toMatch(/notify pgrst, 'reload schema'/);
  });
});
