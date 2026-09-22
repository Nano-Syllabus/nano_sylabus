import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260923090000_marketing_signup_contacts.sql",
);
const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("marketing signup contacts migration", () => {
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
        raw_user_meta_data jsonb not null default '{}'::jsonb
      );
      create function public.set_current_timestamp_updated_at()
      returns trigger language plpgsql as $$
      begin
        new.updated_at = now();
        return new;
      end;
      $$;
    `);
    await db.exec(await readFile(migrationPath, "utf8"));
  });

  afterEach(async () => db.close());

  it("captures an opted-in E.164 number when an account is created", async () => {
    await db.exec(`
      insert into auth.users (id, raw_user_meta_data)
      values (
        '${USER_ID}',
        '{"marketing_phone":"+9779812345678","marketing_phone_marketing_opt_in":true}'::jsonb
      );
    `);

    const result = await db.query<{
      phone_e164: string;
      marketing_opt_in: boolean;
      consent_version: string;
      source: string;
    }>(
      "select phone_e164, marketing_opt_in, consent_version, source from public.marketing_contacts",
    );

    expect(result.rows).toEqual([
      {
        phone_e164: "+9779812345678",
        marketing_opt_in: true,
        consent_version: "signup-marketing-v1",
        source: "signup",
      },
    ]);
  });

  it("marks a contact opted out when its metadata consent is withdrawn", async () => {
    await db.exec(`
      insert into auth.users (id, raw_user_meta_data)
      values (
        '${USER_ID}',
        '{"marketing_phone":"+9779812345678","marketing_phone_marketing_opt_in":true}'::jsonb
      );
      update auth.users
      set raw_user_meta_data = '{"marketing_phone":"+9779812345678","marketing_phone_marketing_opt_in":false}'::jsonb
      where id = '${USER_ID}';
    `);

    const result = await db.query<{
      marketing_opt_in: boolean;
      marketing_opted_out_at: string | null;
    }>("select marketing_opt_in, marketing_opted_out_at from public.marketing_contacts");

    expect(result.rows[0]?.marketing_opt_in).toBe(false);
    expect(result.rows[0]?.marketing_opted_out_at).not.toBeNull();
  });
});
