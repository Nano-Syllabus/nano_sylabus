import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";

const foundation = path.join(process.cwd(), "supabase/migrations/20260830153000_community_foundation.sql");
const learning = path.join(process.cwd(), "supabase/migrations/20260830170000_community_learning_flow.sql");
const subjectReuse = path.join(
  process.cwd(),
  "supabase/migrations/20260830183000_community_subject_reuse.sql",
);

describe("community learning migration", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      create schema auth;
      create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create role anon;
      create role authenticated;
      create role service_role;
      create table public.teachers (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id),
        handle text not null unique,
        collection_sk text not null
      );
      create table public.teacher_courses (
        id uuid primary key default gen_random_uuid(),
        teacher_id uuid not null references public.teachers(id),
        slug text not null unique
      );
      create table public.student_challenges (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id),
        status text not null default 'assigned',
        completed_at timestamptz,
        attempt_count integer not null default 0,
        last_score numeric,
        last_total_marks numeric,
        last_attempt_id uuid,
        updated_at timestamptz not null default now()
      );
      create table public.student_topic_mastery (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id),
        course_id uuid references public.teacher_courses(id),
        subject_slug text not null,
        topic_key text not null,
        status text not null default 'not_attempted',
        percentage numeric not null default 0
      );
      create table storage.buckets (
        id text primary key,
        name text not null,
        public boolean not null default false,
        file_size_limit bigint
      );
    `);
    await db.exec(await readFile(foundation, "utf8"));
    await db.exec(await readFile(learning, "utf8"));
    await db.exec(await readFile(subjectReuse, "utf8"));
    await db.exec(`
      insert into auth.users(id) values
        ('11111111-1111-4111-8111-111111111111'),
        ('22222222-2222-4222-8222-222222222222');
    `);
  });

  afterEach(async () => db.close());

  it("crosses a resource threshold exactly once", async () => {
    await db.query(`select public.create_community_with_terms($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
      "11111111-1111-4111-8111-111111111111", "sec-bei", "SEC BEI", "PU", "BEI", "", 4, 8, "public",
    ]);
    await db.query("select public.join_community($1,$2)", ["22222222-2222-4222-8222-222222222222", "sec-bei"]);
    await db.exec(`
      update public.communities set contribution_threshold = 2;
      insert into public.community_subjects (community_id,term_id,created_by,slug,name)
      select community.id, term.id, community.creator_id, 'computer-networks', 'Computer Networks'
      from public.communities community join public.community_terms term on term.community_id = community.id
      where term.semester_number = 3;
      insert into public.community_posts (
        community_id,subject_id,author_id,title,post_type,attachment_bucket,attachment_path,attachment_name
      ) select community_id,id,'22222222-2222-4222-8222-222222222222','TCP/IP bank','resource',
        'community-contributions','file.pdf','file.pdf' from public.community_subjects;
    `);
    const post = await db.query<{ id: string }>("select id from public.community_posts");
    const postId = post.rows[0]!.id;
    const first = await db.query<{ should_merge: boolean; vote_count: number }>("select * from public.vote_community_post($1,$2)", ["22222222-2222-4222-8222-222222222222", postId]);
    const repeat = await db.query<{ should_merge: boolean; vote_count: number }>("select * from public.vote_community_post($1,$2)", ["22222222-2222-4222-8222-222222222222", postId]);
    const crossing = await db.query<{ should_merge: boolean; vote_count: number }>("select * from public.vote_community_post($1,$2)", ["11111111-1111-4111-8111-111111111111", postId]);
    expect(first.rows[0]).toMatchObject({ should_merge: false, vote_count: 1 });
    expect(repeat.rows[0]).toMatchObject({ should_merge: false, vote_count: 1 });
    expect(crossing.rows[0]).toMatchObject({ should_merge: true, vote_count: 2 });
    const events = await db.query<{ total: number }>("select count(*)::integer total from public.community_merge_events where event_type = 'threshold_reached'");
    expect(events.rows[0]?.total).toBe(1);
  });

  it("awards challenge XP only once", async () => {
    await db.exec(`insert into public.student_challenges (id,user_id) values ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222')`);
    await db.query("select * from public.record_student_challenge_grade($1,$2,$3,$4,$5,$6)", [
      "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444", 82, 100, true,
    ]);
    await db.query("select * from public.record_student_challenge_grade($1,$2,$3,$4,$5,$6)", [
      "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333", "55555555-5555-4555-8555-555555555555", 90, 100, true,
    ]);
    const xp = await db.query<{ points: number; total: number }>("select sum(points)::integer points,count(*)::integer total from public.student_xp_ledger");
    expect(xp.rows[0]).toEqual({ points: 50, total: 1 });
  });

  it("reuses one Creator Workspace subject across communities without duplicating it inside one community", async () => {
    await db.exec(`
      insert into public.teachers(id,user_id,handle,collection_sk) values
        ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','ram','collection-key');
    `);
    await db.query(`select public.create_community_with_terms($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
      "11111111-1111-4111-8111-111111111111", "sec-bei", "SEC BEI", "PU", "BEI", "", 4, 8, "public",
    ]);
    await db.query(`select public.create_community_with_terms($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
      "11111111-1111-4111-8111-111111111111", "sec-bei-evening", "SEC BEI Evening", "PU", "BEI", "", 4, 8, "public",
    ]);
    await db.exec(`
      insert into public.community_subjects (
        community_id,term_id,created_by,slug,name,teacher_id,external_subject_slug
      )
      select community.id, term.id, community.creator_id, 'computer-networks', 'Computer Networks',
        '33333333-3333-4333-8333-333333333333', 'computer-networks'
      from public.communities community
      join public.community_terms term on term.community_id = community.id
      where term.semester_number = 3;
    `);
    const reused = await db.query<{ total: number }>(
      "select count(*)::integer total from public.community_subjects where external_subject_slug = 'computer-networks'",
    );
    expect(reused.rows[0]?.total).toBe(2);

    await expect(
      db.exec(`
        insert into public.community_subjects (
          community_id,term_id,created_by,slug,name,teacher_id,external_subject_slug
        )
        select community.id, term.id, community.creator_id, 'computer-networks-copy', 'Computer Networks',
          '33333333-3333-4333-8333-333333333333', 'computer-networks'
        from public.communities community
        join public.community_terms term on term.community_id = community.id
        where community.slug = 'sec-bei' and term.semester_number = 4;
      `),
    ).rejects.toThrow();
  });
});
