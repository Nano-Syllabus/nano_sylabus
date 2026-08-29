import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const db = new PGlite();
const owner = "00000000-0000-0000-0000-000000000001";
const admin = "00000000-0000-0000-0000-000000000002";
const student = "00000000-0000-0000-0000-000000000003";
const anotherStudent = "00000000-0000-0000-0000-000000000004";

async function roleOf(userId: string) {
  const result = await db.query<{ role: string }>(
    "select role from public.student_profiles where user_id = $1",
    [userId],
  );
  return result.rows[0]?.role;
}

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create table public.student_profiles (
      user_id uuid primary key references auth.users(id) on delete cascade,
      full_name text,
      role text not null default 'student'
        check (role in ('student', 'admin', 'super_admin'))
    );
  `);

  await db.exec(
    readFileSync("supabase/migrations/20260829120000_persistent_platform_admin_identity.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/20260829143000_super_admin_delegation.sql", "utf8"),
  );
}, 30_000);

beforeEach(async () => {
  await db.exec(`
    truncate auth.users cascade;
    insert into public.platform_admin_identities (email, is_owner)
    values ('theshumanhere@gmail.com', true)
    on conflict (email) do update set is_owner = true;
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${owner}', 'theshumanhere@gmail.com', '{"full_name":"Founder"}'),
      ('${admin}', 'admin@example.com', '{"full_name":"Admin"}'),
      ('${student}', 'student@example.com', '{"full_name":"Student"}'),
      ('${anotherStudent}', 'another@example.com', '{"full_name":"Another"}');
    insert into public.student_profiles (user_id, full_name, role) values
      ('${owner}', 'Founder', 'super_admin'),
      ('${admin}', 'Admin', 'admin'),
      ('${student}', 'Student', 'student'),
      ('${anotherStudent}', 'Another', 'student')
    on conflict (user_id) do update set role = excluded.role;
  `);
});

afterAll(async () => {
  await db.close();
});

describe("super-admin delegation SQL", () => {
  it("rejects role mutations by an ordinary admin", async () => {
    await expect(
      db.query("select public.set_platform_user_roles($1, $2::uuid[], $3)", [
        admin,
        [student],
        "admin",
      ]),
    ).rejects.toThrow(/Super admin access is required/);
    expect(await roleOf(student)).toBe("student");
  });

  it("lets a super admin grant both admin and durable super-admin access", async () => {
    await db.query("select public.set_platform_user_roles($1, $2::uuid[], $3)", [
      owner,
      [student],
      "admin",
    ]);
    expect(await roleOf(student)).toBe("admin");

    await db.query("select public.set_platform_user_roles($1, $2::uuid[], $3)", [
      owner,
      [student],
      "super_admin",
    ]);
    expect(await roleOf(student)).toBe("super_admin");
    const identity = await db.query<{ is_owner: boolean; granted_by: string }>(
      "select is_owner, granted_by::text from platform_admin_identities where email = 'student@example.com'",
    );
    expect(identity.rows[0]).toEqual({ is_owner: false, granted_by: owner });
  });

  it("removes delegated persistence when a super admin is demoted", async () => {
    await db.query("select public.set_platform_user_roles($1, $2::uuid[], 'super_admin')", [
      owner,
      [student],
    ]);
    await db.query("select public.set_platform_user_roles($1, $2::uuid[], 'student')", [
      owner,
      [student],
    ]);
    expect(await roleOf(student)).toBe("student");
    const identity = await db.query(
      "select 1 from platform_admin_identities where email = 'student@example.com'",
    );
    expect(identity.rows).toHaveLength(0);
  });

  it("prevents self-lockout and founder demotion", async () => {
    await expect(
      db.query("select public.set_platform_user_roles($1, $2::uuid[], 'admin')", [owner, [owner]]),
    ).rejects.toThrow(/cannot remove your own super admin access/);

    await db.query("select public.set_platform_user_roles($1, $2::uuid[], 'super_admin')", [
      owner,
      [student],
    ]);
    const ownerIdentity = await db.query<{ is_owner: boolean }>(
      "select is_owner from platform_admin_identities where email = 'theshumanhere@gmail.com'",
    );
    expect(ownerIdentity.rows[0]?.is_owner).toBe(true);
    await expect(
      db.query("select public.set_platform_user_roles($1, $2::uuid[], 'student')", [
        student,
        [owner],
      ]),
    ).rejects.toThrow(/platform owner cannot be demoted/);
    expect(await roleOf(owner)).toBe("super_admin");
  });
});
