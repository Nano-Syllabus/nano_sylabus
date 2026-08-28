import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adminAnalyticsSchema } from "@/lib/admin-analytics";

// Isolated PostgreSQL, never the user's Supabase. Fixtures cannot reach the app.
const db = new PGlite();
const user = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const today = "((now() at time zone 'Asia/Kathmandu')::date::timestamp at time zone 'Asia/Kathmandu')";
async function snapshot() {
  const result = await db.query<{ data: unknown }>("select public.get_platform_admin_analytics() as data");
  return adminAnalyticsSchema.parse(result.rows[0].data);
}

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key, created_at timestamptz default now(), is_anonymous boolean default false);
    create table public.student_profiles(user_id uuid primary key, role text not null default 'student', full_name text);
    create table public.student_challenges(id uuid default gen_random_uuid(), user_id uuid, status text, completed_at timestamptz);
    create table public.student_practice_attempts(id uuid default gen_random_uuid(), user_id uuid, source text, total_score numeric, total_marks numeric, passed boolean, created_at timestamptz default now());
    create table public.teacher_exam_submissions(id uuid default gen_random_uuid(), student_id uuid, grade jsonb, created_at timestamptz default now());
    create table public.teacher_subject_profiles(id uuid default gen_random_uuid());
    create table public.teacher_courses(id uuid default gen_random_uuid(), status text);
    create table public.invoices(id uuid primary key default gen_random_uuid(), amount integer, currency text, status text);
    create table public.payment_submissions(invoice_id uuid unique, status text, reviewed_at timestamptz);
    create table public.chat_messages(role text);
  `);
  await db.exec(readFileSync("supabase/migrations/20260828120000_platform_admin_analytics.sql", "utf8"));
}, 30_000);

beforeEach(async () => {
  await db.exec("reset role; truncate auth.users, student_profiles, student_challenges, student_practice_attempts, teacher_exam_submissions, teacher_subject_profiles, teacher_courses, invoices, payment_submissions, chat_messages, platform_api_requests;");
});
afterAll(async () => { await db.close(); });

describe("real admin analytics SQL", () => {
  it("returns genuine empty counts, undefined averages and no invented currency", async () => {
    const result = await snapshot();
    expect(result.users.total).toBe(0);
    expect(result.users.growth.every(row => row.percentChange === null)).toBe(true);
    expect(result.content.subjectsPerUser).toBeNull();
    expect(result.exams.averagePercent).toBeNull();
    expect(result.exams.perUser).toBeNull();
    expect(result.revenue.currencies).toEqual([]);
    expect(result.requests.trackedSince).toBeNull();
    expect(result.daily).toHaveLength(30);
    expect(result.daily.every(row => row.newUsers === 0 && row.challengesPassed === 0)).toBe(true);
  });

  it("uses Nepal calendar boundaries and compares equal signup windows", async () => {
    await db.exec(`insert into auth.users(id,created_at,is_anonymous) values
      ('${user}', ${today},false), ('${other}', ${today} - interval '1 second',false),
      (gen_random_uuid(),${today} - interval '7 days',false),
      (gen_random_uuid(),now(),true), (gen_random_uuid(),now() + interval '2 days',false);
      insert into teacher_subject_profiles default values;
      insert into teacher_courses(status) values ('published'),('draft');`);
    const result = await snapshot();
    expect(result.users.total).toBe(3);
    expect(result.users.growth[0]).toEqual({ days: 1, current: 1, previous: 1, percentChange: 0 });
    expect(result.users.growth[1]).toEqual({ days: 7, current: 2, previous: 1, percentChange: 100 });
    expect(result.content).toMatchObject({ subjects: 1, courses: 2, publishedCourses: 1 });
    expect(result.content.subjectsPerUser).toBeCloseTo(1 / 3);
    expect(result.daily[0].newUsers).toBe(1);
    expect(result.daily[1].newUsers).toBe(1);
  });

  it("counts passed assignments once; failures and retries affect only attempt pass rate", async () => {
    await db.exec(`insert into student_challenges(user_id,status,completed_at) values
      ('${user}','completed',now()), ('${other}','completed',now()),
      ('${user}','completed',${today} - interval '1 day'),
      ('${user}','completed',${today} - interval '8 days'),
      ('${user}','in_progress',null), ('${user}','completed',null);
      insert into student_practice_attempts(user_id,source,passed) values
      ('${user}','challenge',true),('${user}','challenge',false),('${user}','challenge',false),
      ('${user}','challenge',null),('${user}','practice',true);`);
    const result = await snapshot();
    expect(result.challenges).toEqual({ passed: 4, today: 2, last7: 3, averagePerDay: 3 / 7, topStudentPerDay: 2 / 7, bestDay: 2, gradedAttempts30: 3, passedAttempts30: 1 });
    expect(result.daily[0].challengesPassed).toBe(2);
  });

  it("deduplicates teacher mirrors, excludes challenge exams, averages percentages not raw marks", async () => {
    await db.exec(`insert into auth.users(id) values ('${user}'),('${other}');
      insert into student_practice_attempts(user_id,source,total_score,total_marks) values
      ('${user}','practice',20,20), ('${user}','practice',0,10),
      ('${user}','teacher_exam',25,50), ('${user}','challenge',20,20);
      insert into teacher_exam_submissions(student_id,grade) values
      ('${user}','{"graded":true,"total_score":25,"total_marks":50}'),
      ('${user}','{"graded":false,"total_score":0,"total_marks":50}');`);
    const result = await snapshot();
    expect(result.exams).toEqual({ completed: 3, today: 3, practice: 2, teacher: 1, perUser: 1.5, averagePercent: 50, scored: 3 });
    expect(result.daily[0].examsCompleted).toBe(3);
  });

  it("never converts invalid scores into real zero grades", async () => {
    await db.exec(`insert into teacher_exam_submissions(grade) values
      ('{"graded":true,"total_score":"unknown","total_marks":20}'),
      ('{"graded":true,"total_score":21,"total_marks":20}'),
      ('{"graded":true,"total_score":0,"total_marks":0}');`);
    const result = await snapshot();
    expect(result.exams.completed).toBe(3);
    expect(result.exams.scored).toBe(0);
    expect(result.exams.averagePercent).toBeNull();
  });

  it("counts only approved paid receipts, by approval day and currency, without /100", async () => {
    await db.exec(`insert into invoices(id,amount,currency,status) values
      ('${user}',1500,'NPR','paid'),('${other}',20,'USD','paid'),
      ('00000000-0000-0000-0000-000000000003',500,'NPR','paid'),
      ('00000000-0000-0000-0000-000000000004',900,'NPR','pending'),
      ('00000000-0000-0000-0000-000000000005',0,'NPR','paid');
      insert into payment_submissions(invoice_id,status,reviewed_at) values
      ('${user}','approved',now()),('${other}','approved',${today} - interval '1 second'),
      ('00000000-0000-0000-0000-000000000003','rejected',now()),
      ('00000000-0000-0000-0000-000000000004','pending',null),
      ('00000000-0000-0000-0000-000000000005','approved',now());`);
    const result = await snapshot();
    expect(result.revenue.currencies).toEqual([
      { currency: 'NPR', total: 1500, today: 1500, payments: 1 },
      { currency: 'USD', total: 20, today: 0, payments: 1 },
    ]);
    expect(result.revenue.unreconciledPaidInvoices).toBe(1);
    expect(result.daily[0].revenue).toEqual([{ currency: 'NPR', amount: 1500 }]);
    expect(result.daily[1].revenue).toEqual([{ currency: 'USD', amount: 20 }]);
  });

  it("counts only recorded API calls, independently of chat messages", async () => {
    await db.exec(`insert into platform_api_requests(service,started_at,succeeded,duration_ms) values
      ('collection',now(),true,100),('tenant',now(),false,300);
      insert into chat_messages(role) values ('user'),('assistant');`);
    expect((await snapshot()).requests).toMatchObject({ recorded: 2, failed: 1, chatMessages: 1 });
  });

  it("denies browser roles analytics/ledger access and self-promotion, even if granted profile writes", async () => {
    await db.exec(`grant select,insert,update on student_profiles to authenticated;
      insert into student_profiles(user_id,role) values ('${user}','student');
      set role authenticated;`);
    await expect(db.query("select public.get_platform_admin_analytics()")).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from platform_api_requests")).rejects.toThrow(/permission denied/);
    await expect(db.query("insert into platform_api_requests(service,started_at,succeeded,duration_ms) values ('tenant',now(),true,1)")).rejects.toThrow(/permission denied/);
    await expect(db.query("update student_profiles set role='admin'")).rejects.toThrow(/cannot be changed/);
    await expect(db.query(`insert into student_profiles(user_id,role) values ('${other}','super_admin')`)).rejects.toThrow(/trusted administrator/);
    await db.query("update student_profiles set full_name='Edited name'");
    await db.exec("reset role; set role service_role;");
    await expect(snapshot()).resolves.toBeDefined();
    await db.exec("reset role;");
  });
});
