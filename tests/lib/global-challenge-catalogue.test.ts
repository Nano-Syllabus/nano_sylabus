import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

describe("global micro-topic discovery", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table teacher_courses(id uuid primary key);
      create table teachers(id uuid primary key);
      create table communities(id uuid primary key, status text, study_course_id uuid);
      create table community_subjects(id uuid primary key, community_id uuid, status text,
        publication_status text, teacher_id uuid, external_subject_slug text, name text);
      create table community_subject_topics(id uuid primary key default gen_random_uuid(),
        community_subject_id uuid, topic_key text, title text, position integer);
      insert into teacher_courses values ('11111111-1111-4111-8111-111111111111');
      insert into teachers values ('22222222-2222-4222-8222-222222222222');
      insert into communities values ('33333333-3333-4333-8333-333333333333','active','11111111-1111-4111-8111-111111111111');
      insert into community_subjects values ('44444444-4444-4444-8444-444444444444','33333333-3333-4333-8333-333333333333',
        'active','published','22222222-2222-4222-8222-222222222222','mechanics','Mechanics');
    `);
    for (const file of ["20260921200000_challenge_topic_pool.sql", "20261007091355_global_challenge_catalogue.sql"]) {
      await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    }
  }, 30_000);
  afterAll(async () => db.close());
  beforeEach(async () => {
    await db.exec(`delete from challenge_topic_pool; delete from community_subject_topics;
      update community_subjects set publication_status='published';
      insert into community_subject_topics (community_subject_id, topic_key, title, position)
      select '44444444-4444-4444-8444-444444444444', 'topic-' || n, 'Micro-topic ' || n, n
      from generate_series(0,4) n;
      insert into community_subject_topics (community_subject_id, topic_key, title, position)
      values ('44444444-4444-4444-8444-444444444444','mechanics-qb','Mechanics QB.pdf',0);
    `);
  });
  const seed = async (limit = 200) => (await db.query<{ n: number }>(
    "select enqueue_global_challenge_catalogue($1) as n", [limit],
  )).rows[0].n;

  it("queues untouched topics in bounded, resumable batches and excludes source documents", async () => {
    expect(await seed(2)).toBe(2);
    expect(await seed(2)).toBe(2);
    expect(await seed(2)).toBe(1);
    expect(await seed()).toBe(0);
    const rows = (await db.query<{ topic_key: string }>("select topic_key from challenge_topic_pool order by position")).rows;
    expect(rows.map((row) => row.topic_key)).toEqual(["topic-0","topic-1","topic-2","topic-3","topic-4"]);
  });
  it("leaves existing content, priority and leases intact", async () => {
    await seed(1);
    await db.exec("update challenge_topic_pool set status='ready', priority=40, lease_owner='worker', content='{\"reading\":{}}'");
    await seed();
    const row = (await db.query("select status, priority, lease_owner, content from challenge_topic_pool where topic_key='topic-0'")).rows[0];
    expect(row).toEqual({status:'ready',priority:40,lease_owner:'worker',content:{reading:{}}});
  });
  it("does not expose draft subjects", async () => {
    await db.exec("update community_subjects set publication_status='draft'");
    expect(await seed()).toBe(0);
  });
  it("allows only the service role and uses invoker permissions", async () => {
    const row = (await db.query(`select
      has_function_privilege('anon','enqueue_global_challenge_catalogue(integer)','execute') as anon,
      has_function_privilege('authenticated','enqueue_global_challenge_catalogue(integer)','execute') as authenticated,
      has_function_privilege('service_role','enqueue_global_challenge_catalogue(integer)','execute') as service,
      (select prosecdef from pg_proc where oid='enqueue_global_challenge_catalogue(integer)'::regprocedure) as definer`)).rows[0];
    expect(row).toEqual({anon:false,authenticated:false,service:true,definer:false});
  });
});
