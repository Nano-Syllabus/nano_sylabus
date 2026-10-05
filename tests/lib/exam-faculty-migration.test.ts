import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const user = "11111111-1111-4111-8111-111111111111";
const otherUser = "22222222-2222-4222-8222-222222222222";
const bct = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const bei = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const bce = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
let db: PGlite;
const choose = (faculty = bct, allowChange = false) =>
  db.query(
    "select public.select_exam_faculty($1,'engineering-license',$2,'{\"goal\":\"Soon\"}'::jsonb,$3)",
    [user, faculty, allowChange],
  );

describe("exam faculty enrollment migration", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid$$;
      grant usage on schema auth to authenticated;
      create table auth.users(id uuid primary key);
      insert into auth.users values ('${user}'),('${otherUser}');
      create table public.landing_sites(slug text primary key, status text, updated_at timestamptz);
      insert into public.landing_sites values ('engineering-license','live',now());
      create table public.communities(id uuid primary key, slug text, status text, visibility text, study_course_id uuid);
      insert into public.communities values
        ('${bct}','bct-license','active','public','${bct}'),
        ('${bei}','bei-license','active','public','${bei}'),
        ('${bce}','bce-license','active','public','${bce}');
      create table public.community_memberships(community_id uuid references communities(id),user_id uuid references auth.users(id) on delete cascade,
        role text,status text,joined_at timestamptz default now(),left_at timestamptz,current_term_id uuid,primary key(community_id,user_id));
      create unique index one_active_member on community_memberships(user_id) where role='member' and status='active';
      create table public.teacher_course_enrollments(course_id uuid, student_id uuid,status text,primary key(course_id,student_id));
      create table public.invoices(id uuid primary key);
      create function public.join_community(target_user_id uuid, target_slug text) returns void language plpgsql as $$
      begin
        insert into public.community_memberships(community_id,user_id,role,status)
        select id,target_user_id,'member','active' from public.communities where slug=target_slug
        on conflict(community_id,user_id) do update set status='active',left_at=null;
      end; $$;
    `);
    await db.exec(
      await readFile("supabase/migrations/20261004164226_exam_faculty_enrollment.sql", "utf8"),
    );
  }, 30_000);
  afterAll(async () => db.close());
  beforeEach(async () => {
    await db.exec(`reset role; delete from student_exam_enrollments;
      truncate community_memberships,teacher_course_enrollments;
      select public.configure_landing_exam('engineering-license','{"enabled":true,"facultySlugs":["bct-license","bei-license"]}');`);
  });

  it("joins the chosen faculty and learning course atomically, with an idempotent retry", async () => {
    await choose();
    await choose();
    expect(
      (await db.query("select community_id,preparation_answers from student_exam_enrollments"))
        .rows,
    ).toEqual([{ community_id: bct, preparation_answers: { goal: "Soon" } }]);
    expect(
      (await db.query("select course_id,status from teacher_course_enrollments")).rows,
    ).toEqual([{ course_id: bct, status: "active" }]);
    expect(
      (
        await db.query(
          "select count(*)::int as count from community_memberships where status='active'",
        )
      ).rows[0],
    ).toEqual({ count: 1 });
  });
  it("rejects unsupported faculties without replacing an existing membership", async () => {
    await db.exec(
      `insert into community_memberships(community_id,user_id,role,status) values('${bce}','${user}','member','active');`,
    );
    await expect(choose(bce)).rejects.toThrow("Unsupported faculty");
    expect((await db.query("select community_id,status from community_memberships")).rows).toEqual([
      { community_id: bce, status: "active" },
    ]);
    expect((await db.query("select * from student_exam_enrollments")).rows).toHaveLength(0);
  });
  it("blocks a second choice and direct leave, join, delete or user reassignment", async () => {
    await choose();
    await expect(choose(bei)).rejects.toThrow("locked");
    await expect(
      db.exec(`update community_memberships set status='left' where user_id='${user}';`),
    ).rejects.toThrow("locked");
    await expect(db.exec(`select join_community('${user}','bei-license');`)).rejects.toThrow(
      "locked",
    );
    await expect(
      db.exec(`delete from community_memberships where user_id='${user}';`),
    ).rejects.toThrow("locked");
    await expect(
      db.exec(`update community_memberships set user_id='${otherUser}' where user_id='${user}';`),
    ).rejects.toThrow("locked");
  });
  it("allows an admin correction while ending access to the previous course", async () => {
    await choose();
    await choose(bei, true);
    expect((await db.query("select community_id from student_exam_enrollments")).rows[0]).toEqual({
      community_id: bei,
    });
    expect(
      (await db.query("select course_id,status from teacher_course_enrollments order by course_id"))
        .rows,
    ).toEqual([
      { course_id: bct, status: "cancelled" },
      { course_id: bei, status: "active" },
    ]);
    expect(
      (await db.query("select community_id from community_memberships where status='active'")).rows,
    ).toEqual([{ community_id: bei }]);
  });
  it("retains historical enrollment when a faculty is removed, but refuses new selections", async () => {
    await choose();
    await db.exec(
      `select configure_landing_exam('engineering-license','{"enabled":true,"facultySlugs":["bei-license"]}');`,
    );
    expect((await db.query("select community_id from student_exam_enrollments")).rows[0]).toEqual({
      community_id: bct,
    });
    await expect(
      db.query("select select_exam_faculty($1,'engineering-license',$2,'{}')", [otherUser, bct]),
    ).rejects.toThrow("Unsupported faculty");
  });
  it("rolls back the old lock and memberships if an admin correction cannot join", async () => {
    await choose();
    await db.exec(
      `alter table community_memberships add constraint test_join_failure check(community_id <> '${bei}');`,
    );
    try {
      await expect(choose(bei, true)).rejects.toThrow("test_join_failure");
      expect((await db.query("select community_id from student_exam_enrollments")).rows[0]).toEqual(
        { community_id: bct },
      );
      expect(
        (await db.query("select community_id from community_memberships where status='active'"))
          .rows,
      ).toEqual([{ community_id: bct }]);
    } finally {
      await db.exec("alter table community_memberships drop constraint test_join_failure");
    }
  });
  it("allows account deletion to cascade without leaving a faculty lock", async () => {
    await choose();
    try {
      await db.exec(`delete from auth.users where id='${user}';`);
      expect((await db.query("select * from student_exam_enrollments")).rows).toHaveLength(0);
      expect((await db.query("select * from community_memberships")).rows).toHaveLength(0);
    } finally {
      await db.exec(`insert into auth.users values('${user}') on conflict do nothing;`);
    }
  });
  it("exposes only the student's own lock and denies authenticated writes and RPCs", async () => {
    await choose();
    await db.exec(
      `select set_config('request.jwt.claim.sub','${otherUser}',false); set role authenticated;`,
    );
    expect((await db.query("select * from student_exam_enrollments")).rows).toEqual([]);
    await db.exec(`select set_config('request.jwt.claim.sub','${user}',false);`);
    expect((await db.query("select community_id from student_exam_enrollments")).rows).toEqual([
      { community_id: bct },
    ]);
    await expect(choose(bei, true)).rejects.toThrow("permission denied");
    await expect(db.exec("delete from student_exam_enrollments")).rejects.toThrow(
      "permission denied",
    );
    await expect(db.exec("select * from landing_exam_faculties")).rejects.toThrow(
      "permission denied",
    );
  });
});
