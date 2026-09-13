import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260913113000_subscription_cancellation.sql",
);

describe("subscription cancellation migration", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      create schema auth;
      create table auth.users(id uuid primary key);
      create table public.subscription_plans(id uuid primary key);
      create table public.invoices(id uuid primary key);
      create table public.user_subscriptions (
        id uuid primary key,
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

  it("stores a scheduled cancellation without changing the active subscription", async () => {
    await db.exec(`
      insert into auth.users values ('11111111-1111-4111-8111-111111111111');
      insert into public.subscription_plans values ('22222222-2222-4222-8222-222222222222');
      insert into public.user_subscriptions (id, user_id, plan_id, status, ends_at)
      values (
        '33333333-3333-4333-8333-333333333333',
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        'active',
        now() + interval '30 days'
      );
      update public.user_subscriptions
      set cancel_at_period_end = true,
          cancelled_at = now(),
          cancellation_reason = 'No longer needed'
      where id = '33333333-3333-4333-8333-333333333333';
    `);

    const result = await db.query<{
      status: string;
      cancel_at_period_end: boolean;
      cancelled_at: string | null;
      cancellation_reason: string | null;
    }>(
      "select status, cancel_at_period_end, cancelled_at, cancellation_reason from public.user_subscriptions",
    );

    expect(result.rows[0]).toMatchObject({
      status: "active",
      cancel_at_period_end: true,
      cancellation_reason: "No longer needed",
    });
    expect(result.rows[0]?.cancelled_at).toBeTruthy();
  });
});
