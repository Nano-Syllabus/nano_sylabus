import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260830153000_community_foundation.sql",
);

describe("community foundation migration", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create role anon;
      create role authenticated;
      create role service_role;
    `);
    await db.exec(await readFile(migrationPath, "utf8"));
    await db.exec(`
      insert into auth.users(id) values
        ('11111111-1111-4111-8111-111111111111'),
        ('22222222-2222-4222-8222-222222222222');
    `);
  });

  afterEach(async () => {
    await db.close();
  });

  it("atomically creates a community, eight terms, and creator membership", async () => {
    await db.query(`select public.create_community_with_terms($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
      "11111111-1111-4111-8111-111111111111",
      "sec-bei",
      "SEC BEI",
      "Pokhara University",
      "BEI",
      "Shared academic community.",
      4,
      8,
      "public",
    ]);

    const terms = await db.query<{
      year_number: number;
      semester_number: number;
      semester_in_year: number;
    }>(
      "select year_number, semester_number, semester_in_year from public.community_terms order by semester_number",
    );
    const memberships = await db.query<{ role: string; status: string }>(
      "select role,status from public.community_memberships",
    );

    expect(terms.rows).toEqual([
      { year_number: 1, semester_number: 1, semester_in_year: 1 },
      { year_number: 1, semester_number: 2, semester_in_year: 2 },
      { year_number: 2, semester_number: 3, semester_in_year: 1 },
      { year_number: 2, semester_number: 4, semester_in_year: 2 },
      { year_number: 3, semester_number: 5, semester_in_year: 1 },
      { year_number: 3, semester_number: 6, semester_in_year: 2 },
      { year_number: 4, semester_number: 7, semester_in_year: 1 },
      { year_number: 4, semester_number: 8, semester_in_year: 2 },
    ]);
    expect(memberships.rows).toEqual([{ role: "creator", status: "active" }]);
  });

  it("joins a student idempotently", async () => {
    await db.query(`select public.create_community_with_terms($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
      "11111111-1111-4111-8111-111111111111",
      "sec-bei",
      "SEC BEI",
      "Pokhara University",
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
    await db.query("select public.join_community($1,$2)", [
      "22222222-2222-4222-8222-222222222222",
      "sec-bei",
    ]);

    const result = await db.query<{ total: number }>(
      "select count(*)::integer as total from public.community_memberships",
    );
    const student = await db.query<{ role: string; status: string }>(
      "select role,status from public.community_memberships where user_id = $1",
      ["22222222-2222-4222-8222-222222222222"],
    );
    expect(result.rows[0]?.total).toBe(2);
    expect(student.rows).toEqual([{ role: "member", status: "active" }]);
  });
});
