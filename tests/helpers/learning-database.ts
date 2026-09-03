import type { SupabaseClient } from "@supabase/supabase-js";
import { vi } from "vitest";

type Row = Record<string, unknown>;

/** Stateful query double: publication and student reads use the same saved rows. */
export function learningDatabase(tables: Record<string, Row[]>) {
  const failures = new Map<string, string>();
  const from = vi.fn((table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let operation = "select";
    let values: Row[] = [];
    let conflict = "id";
    let single = false;
    let limit = Infinity;
    const execute = () => {
      if (failures.has(`${table}:${operation}`))
        return { data: null, error: new Error(failures.get(`${table}:${operation}`)) };
      const rows = (tables[table] ||= []);
      const matches = (row: Row) => filters.every((filter) => filter(row));
      if (operation === "upsert" || operation === "insert") {
        for (const value of values) {
          const prior =
            operation === "upsert" &&
            rows.find((row) => conflict.split(",").every((key) => row[key] === value[key]));
          if (prior) Object.assign(prior, value);
          else rows.push({ id: `${table}-${rows.length}`, ...value });
        }
      } else if (operation === "update") {
        for (const row of rows.filter(matches)) Object.assign(row, values[0]);
      } else if (operation === "delete") {
        tables[table] = rows.filter((row) => !matches(row));
      }
      const selected = rows.filter(matches).slice(0, limit);
      return { data: single ? selected[0] || null : selected, error: null };
    };
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => {
        filters.push((row) => row[key] === value);
        return query;
      },
      in: (key: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[key]));
        return query;
      },
      limit: (count: number) => {
        limit = count;
        return query;
      },
      order: () => query,
      upsert: (value: Row | Row[], options: { onConflict: string }) => {
        operation = "upsert";
        values = Array.isArray(value) ? value : [value];
        conflict = options.onConflict;
        return query;
      },
      update: (value: Row) => {
        operation = "update";
        values = [value];
        return query;
      },
      delete: () => {
        operation = "delete";
        return query;
      },
      maybeSingle: () => {
        single = true;
        return Promise.resolve(execute());
      },
      single: () => {
        single = true;
        return Promise.resolve(execute());
      },
      then: (resolve: (result: ReturnType<typeof execute>) => unknown) =>
        Promise.resolve(execute()).then(resolve),
    };
    return query;
  });
  return { admin: { from } as unknown as SupabaseClient, tables, failures, from };
}

export function communityLearningFixture() {
  return learningDatabase({
    communities: [
      {
        id: "community-1",
        slug: "henglish",
        creator_id: "owner",
        status: "active",
        study_course_id: "course-1",
      },
    ],
    community_subjects: [
      {
        id: "subject-1",
        community_id: "community-1",
        teacher_id: "teacher-1",
        external_subject_slug: "teacher_nims",
        name: "Nims",
        status: "active",
      },
    ],
    teachers: [{ id: "teacher-1", collection_sk: "collection", handle: "owner" }],
    community_memberships: [
      { community_id: "community-1", user_id: "member", status: "active" },
      { community_id: "community-1", user_id: "former-member", status: "left" },
    ],
    teacher_subject_syllabi: [],
    community_subject_topics: [],
    teacher_document_files: [],
  });
}
