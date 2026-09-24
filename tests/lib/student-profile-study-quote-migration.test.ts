import { readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260924030000_add_student_profile_study_quote.sql",
);

describe("student profile study quote migration", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      create table public.student_profiles (
        user_id uuid primary key,
        full_name text
      );
    `);
    await db.exec(await readFile(migrationPath, "utf8"));
  }, 30_000);

  afterEach(async () => db.close());

  it("persists a profile reminder and permits removing it", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    await db.exec(`
      insert into public.student_profiles (user_id, full_name)
      values ('${userId}', 'Suman Giri');
      update public.student_profiles
      set study_quote = 'One topic. One small win.'
      where user_id = '${userId}';
    `);

    const saved = await db.query<{ study_quote: string | null }>(
      `select study_quote from public.student_profiles where user_id = '${userId}'`,
    );
    expect(saved.rows[0]?.study_quote).toBe("One topic. One small win.");

    await db.exec(`update public.student_profiles set study_quote = null where user_id = '${userId}';`);
    const removed = await db.query<{ study_quote: string | null }>(
      `select study_quote from public.student_profiles where user_id = '${userId}'`,
    );
    expect(removed.rows[0]?.study_quote).toBeNull();
  });

  it("rejects reminders over 140 characters", async () => {
    const tooLong = "a".repeat(141);
    await db.exec(`insert into public.student_profiles (user_id) values ('22222222-2222-4222-8222-222222222222');`);

    await expect(
      db.query(`update public.student_profiles set study_quote = '${tooLong}'`),
    ).rejects.toThrow(/student_profiles_study_quote_length|check constraint/i);
  });
});
