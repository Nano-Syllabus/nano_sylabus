import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";

const foundation = path.join(
  process.cwd(),
  "supabase/migrations/20260830153000_community_foundation.sql",
);
const learning = path.join(
  process.cwd(),
  "supabase/migrations/20260830170000_community_learning_flow.sql",
);
const subjectReuse = path.join(
  process.cwd(),
  "supabase/migrations/20260830183000_community_subject_reuse.sql",
);
const singleActiveCommunity = path.join(
  process.cwd(),
  "supabase/migrations/20260901090000_single_active_student_community.sql",
);
const communityHub = path.join(
  process.cwd(),
  "supabase/migrations/20260902120000_real_community_hub.sql",
);
const ownerDeletion = path.join(
  process.cwd(),
  "supabase/migrations/20260903100000_community_owner_deletion.sql",
);

describe("community learning migration", () => {
  let db: PGlite;

  // PGlite's first WASM startup plus the full migration chain can exceed 10s
  // while the production compiler is running on the same machine.
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
        slug text not null unique,
        status text not null default 'published'
      );
      create table public.teacher_course_enrollments (
        course_id uuid not null references public.teacher_courses(id),
        student_id uuid not null references auth.users(id),
        status text not null default 'active',
        primary key (course_id, student_id)
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
    await db.exec(await readFile(singleActiveCommunity, "utf8"));
    await db.exec(await readFile(communityHub, "utf8"));
    await db.exec(await readFile(ownerDeletion, "utf8"));
    await db.exec(await readFile(path.join(process.cwd(), "supabase/migrations/20260903153000_community_leave_access.sql"), "utf8"));
    await db.exec(`
      insert into auth.users(id) values
        ('11111111-1111-4111-8111-111111111111'),
        ('22222222-2222-4222-8222-222222222222');
    `);
  }, 30_000);

  afterEach(async () => db.close());

  const owner = "11111111-1111-4111-8111-111111111111";
  const member = "22222222-2222-4222-8222-222222222222";
  async function seedDeletion() {
    await db.query("select public.create_community_with_terms($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
      owner,
      "owned",
      "Owned",
      "TU",
      "CS",
      "",
      1,
      2,
      "public",
    ]);
    await db.query("select public.create_community_with_terms($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
      owner,
      "other",
      "Other",
      "TU",
      "CS",
      "",
      1,
      2,
      "public",
    ]);
    await db.query("select public.join_community($1,$2)", [member, "owned"]);
    await db.exec(`
      insert into teachers(user_id,handle,collection_sk) values ('${owner}','owner','source-collection');
      insert into teacher_courses(teacher_id,slug) select id, 'owned-course' from teachers;
      update communities set study_course_id = (select id from teacher_courses) where slug = 'owned';
      insert into teacher_course_enrollments(course_id,student_id) select id, '${member}' from teacher_courses;
      insert into community_subjects(community_id,term_id,created_by,slug,name,teacher_id,external_subject_slug)
      select c.id,t.id,c.creator_id,'math','Math',(select id from teachers),'source-math'
      from communities c join community_terms t on t.community_id=c.id where t.semester_number=1;
      insert into community_invites(community_id,created_by) select id,creator_id from communities where slug='owned';
      insert into student_challenges(user_id,status) values ('${member}','completed');
    `);
  }

  it.each(["active", "completed"])("leaving cancels %s access without deleting progress or the community", async (enrollmentStatus) => {
    await seedDeletion();
    await db.query("update teacher_course_enrollments set status = $1", [enrollmentStatus]);
    await db.exec(`insert into student_topic_mastery(user_id,course_id,subject_slug,topic_key,percentage)
      select '${member}', id, 'source-math', 'algebra', 80 from teacher_courses;`);
    await db.query("select leave_community($1, (select id from communities where slug='owned'))", [member]);
    expect((await db.query("select status, current_term_id, left_at is not null as has_left_at from community_memberships where user_id=$1", [member])).rows)
      .toEqual([{ status: "left", current_term_id: null, has_left_at: true }]);
    expect((await db.query("select status from teacher_course_enrollments")).rows).toEqual([{ status: "cancelled" }]);
    expect((await db.query("select status from student_challenges")).rows).toEqual([{ status: "completed" }]);
    expect((await db.query("select percentage from student_topic_mastery")).rows).toEqual([{ percentage: "80" }]);
    expect((await db.query("select status from communities where slug='owned'")).rows).toEqual([{ status: "active" }]);
    expect((await db.query("select status from community_memberships where user_id=$1", [owner])).rows)
      .toEqual([{ status: "active" }, { status: "active" }]);
    // Leaving does not consume an invite or delete material; a public rejoin still works.
    await db.query("select join_community($1, 'owned')", [member]);
    expect((await db.query("select status from community_memberships where user_id=$1", [member])).rows).toEqual([{ status: "active" }]);
  });

  it("rejects creator and non-member leave without changing community access", async () => {
    await seedDeletion();
    await expect(db.query("select leave_community($1, (select id from communities where slug='owned'))", [owner])).rejects.toThrow("creators cannot leave");
    await expect(db.query("select leave_community($1, (select id from communities where slug='other'))", [member])).rejects.toThrow("Active community membership not found");
    expect((await db.query("select status from teacher_course_enrollments")).rows).toEqual([{ status: "active" }]);
  });

  it("rolls back leave if enrollment revocation fails", async () => {
    await seedDeletion();
    await db.exec(`
      create function reject_cancellation() returns trigger language plpgsql as $$
      begin raise exception 'Enrollment unavailable'; end; $$;
      create trigger reject_cancellation before update on teacher_course_enrollments
      for each row execute function reject_cancellation();
    `);
    await expect(db.query("select leave_community($1, (select id from communities where slug='owned'))", [member]))
      .rejects.toThrow("Enrollment unavailable");
    expect((await db.query("select status from community_memberships where user_id=$1", [member])).rows)
      .toEqual([{ status: "active" }]);
  });

  it("lets only the owner delete, with exact confirmation and no partial changes", async () => {
    await seedDeletion();
    await expect(
      db.query("select delete_owned_community($1,$2,$3)", [member, "owned", "owned"]),
    ).rejects.toThrow("Only the community creator");
    await expect(
      db.query("select delete_owned_community($1,$2,$3)", [null, "owned", "owned"]),
    ).rejects.toThrow("Only the community creator");
    await expect(
      db.query("select delete_owned_community($1,$2,$3)", [owner, "owned", "wrong"]),
    ).rejects.toThrow("Type the community");
    await expect(
      db.query("select delete_owned_community($1,$2,$3)", [owner, "missing", "missing"]),
    ).rejects.toThrow("Community not found");
    expect((await db.query("select status from communities where slug='owned'")).rows).toEqual([
      { status: "active" },
    ]);
    expect((await db.query("select status from teacher_course_enrollments")).rows).toEqual([
      { status: "active" },
    ]);
  });

  it("archives atomically, closes access, keeps subjects/history, and supports safe retries", async () => {
    await seedDeletion();
    const first = await db.query("select delete_owned_community($1,$2,$3) as id", [
      owner,
      "owned",
      "owned",
    ]);
    expect(
      (await db.query("select delete_owned_community($1,$2,$3) as id", [owner, "owned", "owned"]))
        .rows,
    ).toEqual(first.rows);
    expect((await db.query("select slug,status from communities order by slug")).rows).toEqual([
      { slug: "other", status: "active" },
      { slug: "owned", status: "archived" },
    ]);
    expect(
      (
        await db.query(
          "select m.status from community_memberships m join communities c on c.id=m.community_id where c.slug='owned'",
        )
      ).rows,
    ).toEqual([{ status: "left" }, { status: "left" }]);
    expect((await db.query("select status from teacher_courses")).rows).toEqual([
      { status: "archived" },
    ]);
    expect((await db.query("select status from teacher_course_enrollments")).rows).toEqual([
      { status: "cancelled" },
    ]);
    expect(
      (await db.query("select revoked_at is not null as revoked from community_invites")).rows,
    ).toEqual([{ revoked: true }]);
    expect((await db.query("select count(*)::int as count from community_subjects")).rows).toEqual([
      { count: 2 },
    ]);
    expect((await db.query("select status from student_challenges")).rows).toEqual([
      { status: "completed" },
    ]);
    await expect(db.query("select join_community($1,$2)", [member, "owned"])).rejects.toThrow();
    const invite = await db.query<{ token: string }>("select token from community_invites");
    await expect(
      db.query("select redeem_community_invite($1,$2)", [member, invite.rows[0].token]),
    ).rejects.toThrow();
    // Former members are no longer blocked by the one-active-community rule.
    await db.query("select join_community($1,$2)", [member, "other"]);
    await expect(db.exec("update teacher_course_enrollments set status='active'")).rejects.toThrow(
      "no longer active",
    );
    await expect(
      db.exec(
        "update community_memberships set status='active' where community_id=(select id from communities where slug='owned')",
      ),
    ).rejects.toThrow("no longer active");
  });

  it("rolls back every change if one access-revocation step fails", async () => {
    await seedDeletion();
    await db.exec(`create function fail_deletion_test() returns trigger language plpgsql as $$
      begin raise exception 'forced failure'; end; $$;
      create trigger fail_deletion_test before update on teacher_courses for each row execute function fail_deletion_test();`);
    await expect(
      db.query("select delete_owned_community($1,$2,$3)", [owner, "owned", "owned"]),
    ).rejects.toThrow("forced failure");
    expect((await db.query("select status from communities where slug='owned'")).rows).toEqual([
      { status: "active" },
    ]);
    expect((await db.query("select revoked_at from community_invites")).rows).toEqual([
      { revoked_at: null },
    ]);
    expect(
      (
        await db.query(
          "select count(*)::int as count from community_memberships where status='active'",
        )
      ).rows,
    ).toEqual([{ count: 3 }]);
  });

  it("does not expose owner impersonation through the database RPC", async () => {
    const result = await db.query(`select
      has_function_privilege('anon', 'delete_owned_community(uuid,text,text)', 'execute') as anon,
      has_function_privilege('authenticated', 'delete_owned_community(uuid,text,text)', 'execute') as member,
      has_function_privilege('service_role', 'delete_owned_community(uuid,text,text)', 'execute') as service`);
    expect(result.rows).toEqual([{ anon: false, member: false, service: true }]);
  });

  it("crosses a resource threshold exactly once", async () => {
    await db.query(`select public.create_community_with_terms($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
      "11111111-1111-4111-8111-111111111111",
      "sec-bei",
      "SEC BEI",
      "PU",
      "BEI",
      "",
      4,
      8,
      "public",
    ]);
    await db.query("select public.join_community($1,$2)", [
      "22222222-2222-4222-8222-222222222222",
      "sec-bei",
    ]);
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
    const first = await db.query<{ should_merge: boolean; vote_count: number }>(
      "select * from public.vote_community_post($1,$2)",
      ["22222222-2222-4222-8222-222222222222", postId],
    );
    const repeat = await db.query<{ should_merge: boolean; vote_count: number }>(
      "select * from public.vote_community_post($1,$2)",
      ["22222222-2222-4222-8222-222222222222", postId],
    );
    const crossing = await db.query<{ should_merge: boolean; vote_count: number }>(
      "select * from public.vote_community_post($1,$2)",
      ["11111111-1111-4111-8111-111111111111", postId],
    );
    expect(first.rows[0]).toMatchObject({ should_merge: false, vote_count: 1 });
    expect(repeat.rows[0]).toMatchObject({ should_merge: false, vote_count: 1 });
    expect(crossing.rows[0]).toMatchObject({ should_merge: true, vote_count: 2 });
    const events = await db.query<{ total: number }>(
      "select count(*)::integer total from public.community_merge_events where event_type = 'threshold_reached'",
    );
    expect(events.rows[0]?.total).toBe(1);
  });

  it("awards challenge XP only once", async () => {
    await db.exec(
      `insert into public.student_challenges (id,user_id) values ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222')`,
    );
    await db.query("select * from public.record_student_challenge_grade($1,$2,$3,$4,$5,$6)", [
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
      82,
      100,
      true,
    ]);
    await db.query("select * from public.record_student_challenge_grade($1,$2,$3,$4,$5,$6)", [
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "55555555-5555-4555-8555-555555555555",
      90,
      100,
      true,
    ]);
    const xp = await db.query<{ points: number; total: number }>(
      "select sum(points)::integer points,count(*)::integer total from public.student_xp_ledger",
    );
    expect(xp.rows[0]).toEqual({ points: 50, total: 1 });
  });

  it("reuses one Creator Workspace subject across communities without duplicating it inside one community", async () => {
    await db.exec(`
      insert into public.teachers(id,user_id,handle,collection_sk) values
        ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','ram','collection-key');
    `);
    await db.query(`select public.create_community_with_terms($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
      "11111111-1111-4111-8111-111111111111",
      "sec-bei",
      "SEC BEI",
      "PU",
      "BEI",
      "",
      4,
      8,
      "public",
    ]);
    await db.query(`select public.create_community_with_terms($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
      "11111111-1111-4111-8111-111111111111",
      "sec-bei-evening",
      "SEC BEI Evening",
      "PU",
      "BEI",
      "",
      4,
      8,
      "public",
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

  it("persists a member semester and redeems a limited invite only once", async () => {
    await db.query(`select public.create_community_with_terms($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
      "11111111-1111-4111-8111-111111111111",
      "sec-bei",
      "SEC BEI",
      "PU",
      "BEI",
      "",
      4,
      8,
      "public",
    ]);
    const community = await db.query<{ id: string }>(
      "select id from public.communities where slug = 'sec-bei'",
    );
    const communityId = community.rows[0]!.id;
    const term = await db.query<{ id: string }>(
      "select id from public.community_terms where community_id = $1 and semester_number = 3",
      [communityId],
    );
    const invite = await db.query<{ token: string }>(
      `insert into public.community_invites (community_id,created_by,max_uses)
       values ($1,$2,25) returning token`,
      [communityId, "11111111-1111-4111-8111-111111111111"],
    );

    await db.query("select public.redeem_community_invite($1,$2)", [
      "22222222-2222-4222-8222-222222222222",
      invite.rows[0]!.token,
    ]);
    await db.query("select public.redeem_community_invite($1,$2)", [
      "22222222-2222-4222-8222-222222222222",
      invite.rows[0]!.token,
    ]);
    await db.query("select public.set_community_current_term($1,$2,$3)", [
      "22222222-2222-4222-8222-222222222222",
      communityId,
      term.rows[0]!.id,
    ]);

    const membership = await db.query<{ current_term_id: string; status: string }>(
      "select current_term_id,status from public.community_memberships where community_id = $1 and user_id = $2",
      [communityId, "22222222-2222-4222-8222-222222222222"],
    );
    const usage = await db.query<{ use_count: number; redemption_count: number }>(
      `select invite.use_count,
         (select count(*)::integer from public.community_invite_redemptions) as redemption_count
       from public.community_invites invite where invite.token = $1`,
      [invite.rows[0]!.token],
    );

    expect(membership.rows[0]).toEqual({ current_term_id: term.rows[0]!.id, status: "active" });
    expect(usage.rows[0]).toEqual({ use_count: 1, redemption_count: 1 });
  });
});
