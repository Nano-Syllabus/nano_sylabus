import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  renameCreatorSubject,
  SUBJECT_NAME_SNAPSHOTS,
  SUBJECT_SLUG_ONLY_TABLES,
} from "@/lib/data/subject-rename";

/**
 * Renaming a creator's subject must move every copy of its name and nothing that
 * identifies it — and nothing may ask the course API for a subject by a name.
 *
 * 2026-09-24: a creator renamed "Concept of Computer Network and Network
 * Security System" to drop "Concept of". Five tables kept the old name, and
 * challenge calls that asked the course API by the NEW name failed with
 * "subject '…' is not pinned in this collection — one of: <every subject>",
 * shown to a student verbatim. These tests fail if either half comes back.
 */

// ── every table that stores a subject's name is renamed ─────────────────────

type Columns = Map<string, Set<string>>;

/** Table → columns, read from the migrations as they create and alter tables. */
function migratedColumns(): Columns {
  const dir = "supabase/migrations";
  const tables: Columns = new Map();
  const add = (table: string, column: string) => {
    if (!tables.has(table)) tables.set(table, new Set());
    tables.get(table)!.add(column.toLowerCase());
  };
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(dir, file), "utf8").replace(/--[^\n]*/g, "");
    for (const match of sql.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
      for (const line of match[2].split("\n")) {
        const column = /^\s*"?([a-z_][a-z0-9_]*)"?\s+[a-z]/i.exec(line)?.[1];
        if (column && !/^(constraint|primary|unique|foreign|check)$/i.test(column)) add(match[1], column);
      }
    }
    for (const match of sql.matchAll(/alter table (?:if exists )?(?:only )?(?:public\.)?(\w+)([\s\S]*?);/gi)) {
      for (const column of match[2].matchAll(/add column (?:if not exists )?"?(\w+)"?/gi)) add(match[1], column[1]);
    }
  }
  return tables;
}

describe("renaming a subject reaches every table that keeps its name", () => {
  const tables = migratedColumns();
  const registered = new Set(SUBJECT_NAME_SNAPSHOTS.map((snapshot) => snapshot.table));

  it("reads the schema it guards (the parser is not silently finding nothing)", () => {
    expect(tables.get("student_challenges")).toContain("subject_name");
    expect(tables.get("community_subjects")).toContain("external_subject_slug");
  });

  it("registers every table that stores a subject slug — renamed, or named slug-only on purpose", () => {
    const withSlug = [...tables]
      .filter(([, columns]) => columns.has("subject_slug") || columns.has("external_subject_slug"))
      .map(([table]) => table);
    const unregistered = withSlug.filter(
      (table) => !registered.has(table) && !SUBJECT_SLUG_ONLY_TABLES.includes(table),
    );
    // A new table here keeps a subject by slug. If it also stores the subject's
    // name, add it to SUBJECT_NAME_SNAPSHOTS; if not, to SUBJECT_SLUG_ONLY_TABLES.
    expect(unregistered).toEqual([]);
  });

  it("never files a table that stores a name as slug-only", () => {
    for (const table of SUBJECT_SLUG_ONLY_TABLES) {
      expect(tables.get(table), table).not.toContain("subject_name");
    }
  });

  it("names the columns each registered table really has", () => {
    for (const snapshot of SUBJECT_NAME_SNAPSHOTS) {
      const columns = tables.get(snapshot.table);
      expect(columns, snapshot.table).toBeDefined();
      expect(columns, snapshot.table).toContain(snapshot.nameColumn);
      expect(columns, snapshot.table).toContain(snapshot.slugColumn);
      if (snapshot.teacherScoped) expect(columns, snapshot.table).toContain("teacher_id");
      if (snapshot.touch) expect(columns, snapshot.table).toContain("updated_at");
    }
  });
});

describe("renameCreatorSubject", () => {
  /** Records each update as table → { values, filters }. */
  function recordingAdmin(missing: string[] = []) {
    const updates = new Map<string, { values: Record<string, unknown>; filters: Record<string, unknown> }>();
    const admin = {
      from(table: string) {
        const entry = { values: {} as Record<string, unknown>, filters: {} as Record<string, unknown> };
        const query = {
          update(values: Record<string, unknown>) {
            entry.values = values;
            return query;
          },
          eq(column: string, value: unknown) {
            entry.filters[column] = value;
            return query;
          },
          async select() {
            if (missing.includes(table)) return { data: null, error: { code: "42P01" } };
            updates.set(table, entry);
            return { data: [{}, {}], error: null };
          },
        };
        return query;
      },
    };
    return { admin: admin as never, updates };
  }

  it("renames every registered copy, matched by slug and never changing it", async () => {
    const { admin, updates } = recordingAdmin();
    const result = await renameCreatorSubject(admin, {
      teacherId: "teacher-1",
      subjectSlug: "prashant_teacher_concept_of_computer_network",
      name: "Computer Network and Network Security System",
    });
    expect([...updates.keys()].sort()).toEqual(SUBJECT_NAME_SNAPSHOTS.map((s) => s.table).sort());
    for (const snapshot of SUBJECT_NAME_SNAPSHOTS) {
      const update = updates.get(snapshot.table)!;
      expect(update.values[snapshot.nameColumn], snapshot.table).toBe("Computer Network and Network Security System");
      // The identity is what is matched on, and is never written.
      expect(update.filters[snapshot.slugColumn]).toBe("prashant_teacher_concept_of_computer_network");
      expect(update.values).not.toHaveProperty(snapshot.slugColumn);
      if (snapshot.teacherScoped) expect(update.filters.teacher_id).toBe("teacher-1");
      // A student row's updated_at guards concurrent writes; a label never moves it.
      if (snapshot.table.startsWith("student_")) expect(update.values).not.toHaveProperty("updated_at");
    }
    expect(result.updated.student_challenges).toBe(2);
  });

  it("skips a table this database has not migrated yet, and says so", async () => {
    const { admin } = recordingAdmin(["challenge_topic_pool"]);
    const result = await renameCreatorSubject(admin, { teacherId: "t", subjectSlug: "s", name: "N" });
    expect(result.skipped).toEqual(["challenge_topic_pool"]);
  });

  it("is what the rename route runs", () => {
    const route = readFileSync("app/api/teacher/subjects/[slug]/route.ts", "utf8");
    expect(route).toContain("renameCreatorSubject(admin, {");
    // Nothing else in the route writes a subject name on its own.
    expect(route).not.toMatch(/\.update\(\{\s*(?:subject_name|name)\s*[:,]/);
  });
});

// ── nothing asks the course API for a subject by name ───────────────────────

/**
 * Every call that names a subject to the course API, and what it passes. A
 * subject expression is accepted when it is a slug, or one of the carriers
 * built from one (`lane.subject` — see `resolveChallengeLane`).
 */
const UPSTREAM = /\b(getTeacherChallenge\w+|createTeacherChallengeExam|prepareTeacherChallengeTopic|getTeacherPracticeTopics|getTeacherPracticeChapters|translateTeacherChallengeTexts|getTeacherChallengeRevision)\(/g;
const SLUG_CARRIERS = /slug|Slug|^lane\.subject$|^scope\.subject$|^input\.subject$|^topicRequest$|^request$|^\.\.\.topicRequest|^\{\s*\.\.\.topicRequest/;
/** Calls whose subject is the course API's OWN name, read from its subject list. */
const OWN_NAME_ALLOWED = new Set(["app/api/teacher/subjects/[slug]/insights/route.ts"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

function upstreamSubjects(file: string) {
  const source = readFileSync(file, "utf8").replace(/\/\/[^\n]*/g, "");
  const found: Array<{ fn: string; subject: string }> = [];
  for (const match of source.matchAll(UPSTREAM)) {
    let depth = 1;
    let index = match.index! + match[0].length;
    const start = index;
    while (depth && index < source.length) {
      if (source[index] === "(") depth += 1;
      if (source[index] === ")") depth -= 1;
      index += 1;
    }
    const call = source.slice(start, index - 1);
    const named = /subject:\s*([^,\n}]+)/.exec(call)?.[1];
    const positional = call.split(/,(?![^(]*\))/)[1];
    found.push({ fn: match[1], subject: (named ?? positional ?? "").trim() });
  }
  return found;
}

describe("the course API is asked about a subject by slug", () => {
  const files = [...sourceFiles("lib"), ...sourceFiles("app")].filter(
    (file) => !file.endsWith("teacher-app/client.ts") && !OWN_NAME_ALLOWED.has(file),
  );

  it("finds the calls it checks", () => {
    expect(files.flatMap(upstreamSubjects).length).toBeGreaterThan(10);
  });

  it("passes a slug, never a display name, in every call", () => {
    const byName = files.flatMap((file) =>
      upstreamSubjects(file)
        .filter((call) => !SLUG_CARRIERS.test(call.subject))
        .map((call) => `${file}: ${call.fn}(… ${call.subject} …)`),
    );
    expect(byName).toEqual([]);
  });

  it("builds the challenge lane from the slug", () => {
    const source = readFileSync("lib/data/student-challenges.ts", "utf8");
    expect(source).toContain("subject: access.subjectSlug || access.subjectName");
  });
});

