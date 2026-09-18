import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260918150000_challenge_feedback.sql",
);

describe("challenge feedback migration", () => {
  let db: PGlite;
  const challenge = "11111111-1111-1111-1111-111111111111";
  const student = "22222222-2222-2222-2222-222222222222";

  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      create schema auth;
      create table auth.users(id uuid primary key);
      create table public.student_challenges(id uuid primary key);
      insert into auth.users values ('${student}');
      insert into public.student_challenges values ('${challenge}');
    `);
    await db.exec(await readFile(migrationPath, "utf8"));
  });

  afterEach(async () => {
    await db.close();
  });

  const insert = (values: string) =>
    db.exec(`
      insert into public.student_challenge_feedback
        (challenge_id, user_id, exam_attempt_id, skipped, experience_rating, expected_score_band)
      values ('${challenge}', '${student}', ${values});
    `);

  it("stores an answered sitting and a skipped one", async () => {
    await insert(`'chal_1', false, 4, '51-75'`);
    await insert(`'chal_2', true, null, null`);

    const rows = await db.query("select skipped, experience_rating, expected_score_band from public.student_challenge_feedback order by exam_attempt_id");
    expect(rows.rows).toEqual([
      { skipped: false, experience_rating: 4, expected_score_band: "51-75" },
      { skipped: true, experience_rating: null, expected_score_band: null },
    ]);
  });

  it("refuses half an answer — Submit needs both", async () => {
    await expect(insert(`'chal_1', false, 4, null`)).rejects.toThrow();
    await expect(insert(`'chal_1', false, null, '0-25'`)).rejects.toThrow();
  });

  it("holds the options to the ones the modal offers", async () => {
    await expect(insert(`'chal_1', false, 6, '51-75'`)).rejects.toThrow();
    await expect(insert(`'chal_1', false, 3, '50-60'`)).rejects.toThrow();
  });

  it("asks a sitting once", async () => {
    await insert(`'chal_1', false, 4, '51-75'`);
    await expect(insert(`'chal_1', true, null, null`)).rejects.toThrow();
  });
});
