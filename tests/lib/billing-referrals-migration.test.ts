import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260902143000_billing_referrals.sql",
);

describe("billing referral migration", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      create schema auth;
      create role anon;
      create role authenticated;
      create role service_role;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create table public.student_profiles (
        user_id uuid primary key references auth.users(id),
        full_name text,
        role text not null default 'student'
      );
      create function public.is_admin() returns boolean language sql stable as $$ select false $$;
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
        user_id uuid not null references auth.users(id)
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
    await db.exec(await readFile(migrationPath, "utf8"));
  });

  afterEach(async () => db.close());

  it("qualifies a claimed referral and issues each one-month reward once", async () => {
    await db.exec(`
      insert into auth.users(id) values
        ('11111111-1111-4111-8111-111111111111'),
        ('22222222-2222-4222-8222-222222222222');
      insert into public.student_profiles(user_id, full_name) values
        ('11111111-1111-4111-8111-111111111111', 'Referrer'),
        ('22222222-2222-4222-8222-222222222222', 'Friend');
      insert into public.subscription_plans(id,name,slug,billing_type,product_type,is_unlimited)
      values ('33333333-3333-4333-8333-333333333333','Individual Unlimited','individual-unlimited','monthly','individual',true);
      insert into public.billing_referral_links(id,referrer_id,code)
      values ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','REF123456');
      insert into public.billing_referral_claims(link_id,referred_user_id)
      values ('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222');
      insert into public.invoices(id,user_id) values ('55555555-5555-4555-8555-555555555555','22222222-2222-4222-8222-222222222222');
      insert into public.user_subscriptions(user_id,plan_id,invoice_id,status,ends_at)
      values ('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','55555555-5555-4555-8555-555555555555','active',now() + interval '10 days');
    `);

    const claim = await db.query<{ status: string }>(
      "select status from public.billing_referral_claims limit 1",
    );
    const rewards = await db.query<{ total: number }>(
      "select count(*)::integer total from public.billing_referral_rewards",
    );
    const subscriptions = await db.query<{ total: number }>(
      "select count(*)::integer total from public.user_subscriptions",
    );
    expect(claim.rows[0]?.status).toBe("rewarded");
    expect(rewards.rows[0]?.total).toBe(2);
    expect(subscriptions.rows[0]?.total).toBe(2);

    const before = await db.query<{ ends_at: string }>(
      "select ends_at from public.user_subscriptions where user_id = '22222222-2222-4222-8222-222222222222' and invoice_id is not null",
    );
    await db.exec(`
      insert into public.invoices(id,user_id) values ('66666666-6666-4666-8666-666666666666','22222222-2222-4222-8222-222222222222');
      insert into public.user_subscriptions(user_id,plan_id,invoice_id,status)
      values ('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','66666666-6666-4666-8666-666666666666','active');
    `);
    const after = await db.query<{ total: number }>(
      "select count(*)::integer total from public.billing_referral_rewards",
    );
    const original = new Date(before.rows[0]!.ends_at).getTime();
    const current = await db.query<{ ends_at: string }>(
      "select ends_at from public.user_subscriptions where user_id = '22222222-2222-4222-8222-222222222222' and invoice_id = '55555555-5555-4555-8555-555555555555'",
    );
    expect(after.rows[0]?.total).toBe(2);
    expect(new Date(current.rows[0]!.ends_at).getTime()).toBe(original);
  });
});
