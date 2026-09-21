import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPaths = [
  "supabase/migrations/20260902143000_billing_referrals.sql",
  "supabase/migrations/20260910124500_enforce_paid_pro_referrals.sql",
  "supabase/migrations/20260921120000_weekly_cash_prize_campaign.sql",
].map((migration) => path.join(process.cwd(), migration));

const REFERRER = "11111111-1111-4111-8111-111111111111";
const FRIEND = "22222222-2222-4222-8222-222222222222";
const PLAN = "33333333-3333-4333-8333-333333333333";

describe("weekly cash prize migration", () => {
  let db: PGlite;

  /** Act as a signed-in user: the stubbed auth.uid() reads this setting. */
  async function signIn(userId: string) {
    await db.exec(`select set_config('test.uid', '${userId}', false)`);
  }

  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      create schema auth;
      create role anon;
      create role authenticated;
      create role service_role;
      -- Supabase grants every new public table to the API roles by default; the
      -- migration must take those grants back, so the test starts from the same place.
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('test.uid', true), '')::uuid
      $$;
      create table public.student_profiles (
        user_id uuid primary key references auth.users(id),
        full_name text,
        role text not null default 'student'
      );
      create function public.is_admin() returns boolean language sql stable as $$
        select coalesce(current_setting('test.admin', true), '') = 'on'
      $$;
      create table public.subscription_plans (
        id uuid primary key default gen_random_uuid(),
        name text not null,
        slug text not null unique,
        credits integer not null default 1,
        price integer not null default 0,
        currency text not null default 'NPR',
        billing_type text not null,
        product_type text not null default 'individual',
        is_unlimited boolean not null default false,
        is_active boolean not null default true
      );
      create table public.invoices (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id),
        status text not null default 'pending'
      );
      create table public.user_subscriptions (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id),
        plan_id uuid not null references public.subscription_plans(id),
        invoice_id uuid references public.invoices(id),
        status text not null,
        starts_at timestamptz not null default now(),
        ends_at timestamptz,
        created_at timestamptz not null default now()
      );
    `);
    for (const migrationPath of migrationPaths) {
      await db.exec(await readFile(migrationPath, "utf8"));
    }
    await db.exec(`
      insert into auth.users(id) values ('${REFERRER}'), ('${FRIEND}');
      insert into public.subscription_plans(id,name,slug,billing_type,product_type,is_unlimited)
      values ('${PLAN}','Individual Unlimited','individual-unlimited','monthly','individual',true);
    `);
  }, 30_000);

  afterEach(async () => db.close());

  it("lets a free student create a referral link, and a friend claim it", async () => {
    await signIn(REFERRER);
    const link = await db.query<{ code: string }>(
      `select code from public.create_billing_referral_link('${REFERRER}')`,
    );
    expect(link.rows[0]?.code).toMatch(/^[A-Z0-9]{6,32}$/);

    await signIn(FRIEND);
    const claim = await db.query<{ status: string }>(
      `select status from public.claim_billing_referral('${link.rows[0]!.code}', '${FRIEND}')`,
    );
    expect(claim.rows[0]?.status).toBe("claimed");
  });

  it("still refuses a link for someone else, and a claim on your own link", async () => {
    await signIn(FRIEND);
    await expect(
      db.query(`select * from public.create_billing_referral_link('${REFERRER}')`),
    ).rejects.toThrow(/your own referral link/);

    await signIn(REFERRER);
    const link = await db.query<{ code: string }>(
      `select code from public.create_billing_referral_link('${REFERRER}')`,
    );
    await expect(
      db.query(`select * from public.claim_billing_referral('${link.rows[0]!.code}', '${REFERRER}')`),
    ).rejects.toThrow(/cannot claim your own/);
  });

  it("never pays the Pro bonus on a free student's link: the claim is voided when the friend pays", async () => {
    await signIn(REFERRER);
    const link = await db.query<{ code: string }>(
      `select code from public.create_billing_referral_link('${REFERRER}')`,
    );
    await signIn(FRIEND);
    await db.query(`select * from public.claim_billing_referral('${link.rows[0]!.code}', '${FRIEND}')`);

    await db.exec(`
      insert into public.invoices(id,user_id,status)
      values ('55555555-5555-4555-8555-555555555555','${FRIEND}','paid');
      insert into public.user_subscriptions(user_id,plan_id,invoice_id,status,ends_at)
      values ('${FRIEND}','${PLAN}','55555555-5555-4555-8555-555555555555','active',now() + interval '30 days');
    `);

    const claim = await db.query<{ status: string }>("select status from public.billing_referral_claims");
    const rewards = await db.query<{ total: number }>(
      "select count(*)::integer total from public.billing_referral_rewards",
    );
    // The claim row stays — it still counts as a real referral for the campaign.
    expect(claim.rows[0]?.status).toBe("void");
    expect(rewards.rows[0]?.total).toBe(0);
  });

  it("keeps entries writable only by the server and readable only by admins", async () => {
    await db.exec(`
      insert into public.cash_prize_weekly_entries
        (draw_date, user_id, student_name, student_email, streak_days, referral_count, entries)
      values ('2026-09-25', '${REFERRER}', 'Referrer', 'r@example.com', 7, 5, 2);
    `);

    const privileges = await db.query<{ insert: boolean; update: boolean; select: boolean }>(`
      select
        has_table_privilege('authenticated', 'public.cash_prize_weekly_entries', 'insert') as insert,
        has_table_privilege('authenticated', 'public.cash_prize_weekly_entries', 'update') as update,
        has_table_privilege('authenticated', 'public.cash_prize_weekly_entries', 'select') as select
    `);
    expect(privileges.rows[0]).toEqual({ insert: false, update: false, select: true });

    const anon = await db.query<{ allowed: boolean }>(
      "select has_table_privilege('anon', 'public.cash_prize_weekly_entries', 'select') as allowed",
    );
    expect(anon.rows[0]?.allowed).toBe(false);

    await db.exec("set role authenticated");
    const asStudent = await db.query("select * from public.cash_prize_weekly_entries");
    expect(asStudent.rows).toHaveLength(0);
    await db.exec("select set_config('test.admin', 'on', false)");
    const asAdmin = await db.query("select * from public.cash_prize_weekly_entries");
    expect(asAdmin.rows).toHaveLength(1);
    await db.exec("reset role");
  });

  it("holds each student to one entry per Friday draw, with a real streak", async () => {
    const insert = (drawDate: string, streak: number, entries = 1) =>
      db.exec(`
        insert into public.cash_prize_weekly_entries
          (draw_date, user_id, student_name, student_email, streak_days, entries)
        values ('${drawDate}', '${FRIEND}', 'Friend', 'f@example.com', ${streak}, ${entries});
      `);

    await expect(insert("2026-09-24", 7)).rejects.toThrow(); // a Thursday
    await expect(insert("2026-09-25", 6)).rejects.toThrow(); // streak short of 7
    await expect(insert("2026-09-25", 7, 0)).rejects.toThrow(); // no entries
    await insert("2026-09-25", 7);
    await expect(insert("2026-09-25", 9)).rejects.toThrow(/duplicate|unique/);
    await insert("2026-10-02", 14); // next week is a new draw
  });
});
