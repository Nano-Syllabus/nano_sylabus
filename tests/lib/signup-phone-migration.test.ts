import { readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260923091000_signup_phone_number.sql",
);

describe("signup phone number migration", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (
        id uuid primary key,
        email text,
        raw_user_meta_data jsonb not null default '{}'::jsonb
      );
      create table public.student_profiles (
        user_id uuid primary key references auth.users(id) on delete cascade,
        full_name text,
        phone_number text
      );
    `);
    await db.exec(await readFile(migrationPath, "utf8"));
  }, 30_000);

  afterEach(async () => db.close());

  it("creates a profile and stores the submitted signup number", async () => {
    await db.exec(`
      insert into auth.users (id, email, raw_user_meta_data)
      values (
        '11111111-1111-4111-8111-111111111111',
        'student@example.com',
        '{"full_name":"Pratiksha Rai","phone_number":"+9779812345678"}'
      );
    `);

    const result = await db.query<{ full_name: string; phone_number: string }>(
      "select full_name, phone_number from public.student_profiles",
    );

    expect(result.rows).toEqual([
      { full_name: "Pratiksha Rai", phone_number: "+9779812345678" },
    ]);
  });

  it("updates the stored number when auth metadata changes", async () => {
    await db.exec(`
      insert into auth.users (id, email, raw_user_meta_data)
      values (
        '22222222-2222-4222-8222-222222222222',
        'student@example.com',
        '{"phone_number":"+9779812345678"}'
      );
      update auth.users
      set raw_user_meta_data = '{"phone_number":"+9779800000000"}'
      where id = '22222222-2222-4222-8222-222222222222';
    `);

    const result = await db.query<{ phone_number: string }>(
      "select phone_number from public.student_profiles where user_id = '22222222-2222-4222-8222-222222222222'",
    );

    expect(result.rows[0]?.phone_number).toBe("+9779800000000");
  });
});
