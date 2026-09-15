import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260914133000_figma_plus_pro_pricing.sql",
);

describe("Figma Plus and Pro pricing migration", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      create table public.subscription_plans (
        id uuid primary key default gen_random_uuid(),
        name text not null,
        slug text not null unique,
        credits integer not null constraint subscription_plans_credits_check check (credits > 0),
        price integer not null,
        currency text not null,
        billing_type text not null,
        product_type text not null,
        seat_limit integer not null,
        is_unlimited boolean not null,
        features jsonb not null,
        is_active boolean not null,
        updated_at timestamptz not null default now()
      );
      insert into public.subscription_plans
        (id,name,slug,credits,price,currency,billing_type,product_type,seat_limit,is_unlimited,features,is_active)
      values
        ('11111111-1111-4111-8111-111111111111','Individual Unlimited','individual-unlimited',1,1500,'NPR','monthly','individual',1,true,'[]',true),
        ('22222222-2222-4222-8222-222222222222','Group Unlimited','group-unlimited',1,5000,'NPR','monthly','group',5,true,'[]',true);
    `);
  }, 30_000);

  afterEach(async () => db.close(), 30_000);

  it("adds Rs. 450 Plus and preserves Pro and legacy group identities", async () => {
    const migration = await readFile(migrationPath, "utf8");
    await db.exec(migration);

    const { rows } = await db.query<{
      id: string;
      name: string;
      slug: string;
      price: number;
      credits: number;
      is_unlimited: boolean;
      features: string[];
    }>("select id::text,name,slug,price,credits,is_unlimited,features from public.subscription_plans order by slug");

    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.slug === "plus-monthly")).toMatchObject({
      name: "Plus",
      price: 450,
      credits: 0,
      is_unlimited: false,
      features: ["Unlimited challenges", "Exam calendar & study plan", "Romanized Nepali"],
    });
    expect(rows.find((row) => row.slug === "individual-unlimited")).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Pro",
      price: 1500,
      is_unlimited: true,
      features: ["AI tutor", "AI concept videos & animations", "English & Nepali"],
    });
    expect(rows.find((row) => row.slug === "group-unlimited")).toMatchObject({
      id: "22222222-2222-4222-8222-222222222222",
      price: 5000,
    });

    await db.exec(migration);
    const rerun = await db.query<{ count: number }>(
      "select count(*)::integer as count from public.subscription_plans",
    );
    expect(rerun.rows[0]?.count).toBe(3);
  });
});
