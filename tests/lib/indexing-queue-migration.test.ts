import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, expect, it } from "vitest";

let db: PGlite;
const teacher = "00000000-0000-0000-0000-000000000001";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create table auth.users(id uuid primary key);
    create table teachers(id uuid primary key, user_id uuid);
    insert into teachers values ('${teacher}', null);`);
  await db.exec(
    readFileSync("supabase/migrations/20260914120000_teacher_drive_import_queue.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/20261001120000_indexing_queue_recovery.sql", "utf8"),
  );
});
afterAll(async () => {
  await db?.close();
});

it("expires week-old work, keeps the saved path, and reclaims a dead worker", async () => {
  await db.exec(`insert into teacher_drive_imports(teacher_id,drive_file_id,destination_path,status,claimed_at,collection_path,expires_at)
    values ('${teacher}','old','Notes','importing',now()-interval '7 days','Notes/kept.pdf',now()-interval '6 days'),
           ('${teacher}','stalled','Notes','importing',now()-interval '11 minutes','Notes/retry.pdf',now()+interval '1 day');`);
  await db.query("select * from expire_teacher_drive_imports($1)", [teacher]);
  const result = await db.query<{ drive_file_id: string; status: string; collection_path: string }>(
    "select drive_file_id,status,collection_path from teacher_drive_imports order by drive_file_id",
  );
  expect(result.rows).toEqual([
    { drive_file_id: "old", status: "expired", collection_path: "Notes/kept.pdf" },
    { drive_file_id: "stalled", status: "retry_wait", collection_path: "Notes/retry.pdf" },
  ]);
});

it("limits concurrent claims and cannot hand the same file to two workers", async () => {
  await db.exec(`delete from teacher_drive_imports; insert into teacher_drive_imports(teacher_id,drive_file_id,destination_path)
    select '${teacher}', 'file-' || n, 'Notes' from generate_series(1,5) n;`);
  const claims = [];
  for (let i = 0; i < 4; i++)
    claims.push(
      await db.query<{ id: string }>("select * from claim_teacher_drive_import($1)", [teacher]),
    );
  expect(claims.slice(0, 3).map((claim) => claim.rows.length)).toEqual([1, 1, 1]);
  expect(new Set(claims.flatMap((claim) => claim.rows.map((row) => row.id))).size).toBe(3);
  expect(claims[3].rows).toHaveLength(0);
});

it("rejects an old worker's completion after its lease was reclaimed", async () => {
  await db.exec(`delete from teacher_drive_imports; insert into teacher_drive_imports(teacher_id,drive_file_id,destination_path,status,attempts,claimed_at)
    values ('${teacher}','reclaim','Notes','importing',1,now()-interval '11 minutes');`);
  const claim = await db.query<{ id: string; attempts: number }>(
    "select * from claim_teacher_drive_import($1)",
    [teacher],
  );
  expect(claim.rows[0].attempts).toBe(2);
  const stale = await db.query(
    "update teacher_drive_imports set status='done' where id=$1 and attempts=1 and status='importing' returning id",
    [claim.rows[0].id],
  );
  expect(stale.rows).toHaveLength(0);
});
