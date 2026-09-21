import type { SupabaseClient } from "@supabase/supabase-js";
import { vi } from "vitest";

type Row = Record<string, unknown>;

/** Stateful query double: publication and student reads use the same saved rows. */
export function learningDatabase(tables: Record<string, Row[]>) {
  const failures = new Map<string, string>();
  /** Tables this database does not have — a migration that has not run yet —
   *  reported the way PostgREST reports them. */
  const missing = new Set<string>();
  /** Postgres functions by name. One that is not registered is reported missing,
   *  as PostgREST does before its migration has run. */
  const rpcs: Record<string, (args: Record<string, unknown>) => unknown> = {};
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    const handler = rpcs[name];
    if (!handler) {
      return {
        data: null,
        error: { code: "PGRST202", message: `Could not find the function public.${name}` },
      };
    }
    try {
      return { data: await handler(args ?? {}), error: null };
    } catch (error) {
      return { data: null, error };
    }
  });
  const from = vi.fn((table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let operation = "select";
    let values: Row[] = [];
    let conflict = "id";
    let ignoreDuplicates = false;
    let single = false;
    let limit = Infinity;
    const execute = () => {
      if (missing.has(table)) {
        return {
          data: null,
          error: {
            code: "PGRST205",
            message: `Could not find the table 'public.${table}' in the schema cache`,
          },
        };
      }
      if (failures.has(`${table}:${operation}`))
        return { data: null, error: new Error(failures.get(`${table}:${operation}`)) };
      const rows = (tables[table] ||= []);
      const matches = (row: Row) => filters.every((filter) => filter(row));
      if (operation === "upsert" || operation === "insert") {
        for (const value of values) {
          const prior =
            operation === "upsert" &&
            rows.find((row) => conflict.split(",").every((key) => row[key] === value[key]));
          if (prior && !ignoreDuplicates) Object.assign(prior, value);
          else if (!prior) rows.push({ id: `${table}-${rows.length}`, ...value });
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
      neq: (key: string, value: unknown) => {
        filters.push((row) => row[key] !== value);
        return query;
      },
      is: (key: string, value: unknown) => {
        filters.push((row) => (row[key] ?? null) === value);
        return query;
      },
      lt: (key: string, value: unknown) => {
        filters.push((row) => row[key] != null && String(row[key]) < String(value));
        return query;
      },
      lte: (key: string, value: unknown) => {
        filters.push((row) => row[key] != null && String(row[key]) <= String(value));
        return query;
      },
      limit: (count: number) => {
        limit = count;
        return query;
      },
      order: () => query,
      upsert: (value: Row | Row[], options: { onConflict: string; ignoreDuplicates?: boolean }) => {
        operation = "upsert";
        values = Array.isArray(value) ? value : [value];
        conflict = options.onConflict;
        ignoreDuplicates = Boolean(options.ignoreDuplicates);
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
  return {
    admin: { from, rpc } as unknown as SupabaseClient,
    tables,
    failures,
    from,
    missing,
    rpcs,
    rpc,
  };
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
        publication_status: "published",
      },
    ],
    teachers: [{ id: "teacher-1", collection_sk: "collection", handle: "owner" }],
    community_memberships: [
      { community_id: "community-1", user_id: "member", role: "member", status: "active" },
      {
        community_id: "community-1",
        user_id: "former-member",
        role: "member",
        status: "left",
      },
    ],
    teacher_subject_syllabi: [],
    community_subject_topics: [],
    teacher_document_files: [],
  });
}
