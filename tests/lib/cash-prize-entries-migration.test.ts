import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260918133000_cash_prize_daily_entries.sql",
);

describe("cash prize daily entry migration", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      create schema auth;
      create role anon;
      create role authenticated;
      create role service_role;
      create table auth.users (
        id uuid primary key,
        email text,
        raw_user_meta_data jsonb not null default '{}'::jsonb
      );
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create table public.student_profiles (
        user_id uuid primary key references auth.users(id),
        full_name text,
        role text not null default 'student'
      );
      create function public.is_admin() returns boolean language sql stable as $$ select false $$;
      create table public.student_challenges (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id),
        status text not null default 'assigned',
        completed_at timestamptz
      );

      insert into auth.users(id,email,raw_user_meta_data) values
        ('11111111-1111-4111-8111-111111111111','aarav@gmail.com','{"full_name":"Metadata Aarav"}'),
        ('22222222-2222-4222-8222-222222222222','sita@gmail.com','{"full_name":"Sita Metadata"}');
      insert into public.student_profiles(user_id,full_name) values
        ('11111111-1111-4111-8111-111111111111','Aarav Sharma');

      insert into public.student_challenges(id,user_id,status,completed_at) values
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','completed','2026-09-18T18:14:59Z');
    `);
    await db.exec(await readFile(migrationPath, "utf8"));
  }, 30_000);

  afterEach(async () => db.close());

  it("backfills the earliest completion with a name and email snapshot", async () => {
    const result = await db.query<{
      entry_date: string;
      student_name: string;
      student_email: string;
      qualified_at: string;
    }>(`
      select entry_date::text, student_name, student_email, qualified_at::text
      from public.cash_prize_daily_entries
    `);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      entry_date: "2026-09-18",
      student_name: "Aarav Sharma",
      student_email: "aarav@gmail.com",
    });
  });

  it("captures one entry per student per Nepal day when challenges become completed", async () => {
    await db.exec(`
      insert into public.student_challenges(id,user_id,status) values
        ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','assigned'),
        ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','assigned'),
        ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','22222222-2222-4222-8222-222222222222','assigned');

      update public.student_challenges
      set status='completed', completed_at='2026-09-18T18:15:00Z'
      where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      update public.student_challenges
      set status='completed', completed_at='2026-09-18T20:00:00Z'
      where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      update public.student_challenges
      set status='completed', completed_at='2026-09-19T18:15:00Z'
      where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    `);

    const result = await db.query<{
      entry_date: string;
      student_name: string;
      student_email: string;
    }>(`
      select entry_date::text, student_name, student_email
      from public.cash_prize_daily_entries
      where user_id='22222222-2222-4222-8222-222222222222'
      order by entry_date
    `);

    expect(result.rows).toEqual([
      {
        entry_date: "2026-09-19",
        student_name: "Sita Metadata",
        student_email: "sita@gmail.com",
      },
      {
        entry_date: "2026-09-20",
        student_name: "Sita Metadata",
        student_email: "sita@gmail.com",
      },
    ]);
  });
});
