import { describe, expect, it, vi } from "vitest";
import { clearStudentStudyTrails } from "@/lib/data/study-trail-cleanup";

type Row = Record<string, unknown>;

function makeAdmin(
  rowsByTable: Record<string, Row[]>,
  storageError: { message: string } | null = null,
) {
  const operations: Array<{ table: string; filters: Array<[string, unknown]> }> = [];

  const admin = {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let operation: "select" | "delete" = "select";
      const query: Record<string, any> = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          filters.push([column, value]);
          return query;
        }),
        in: vi.fn((column: string, value: unknown) => {
          filters.push([column, value]);
          return query;
        }),
        delete: vi.fn(() => {
          operation = "delete";
          operations.push({ table, filters });
          return query;
        }),
        then: (resolve: (value: { data: Row[] | null; error: null }) => unknown) =>
          Promise.resolve({
            data: operation === "delete" ? null : rowsByTable[table] || [],
            error: null,
          }).then(resolve),
      };
      return query;
    },
    storage: {
      from: vi.fn(() => ({ remove: vi.fn(async () => ({ error: storageError })) })),
    },
  };

  return { admin: admin as any, operations };
}

describe("study trail cleanup", () => {
  it("removes only the leaving student's subject trails and preserves other subjects", async () => {
    const { admin, operations } = makeAdmin({
      revision_notes: [
        { id: "note-a", user_id: "student-1", course_id: "course-1", subject_slug: "physics" },
        { id: "note-b", user_id: "student-1", course_id: "course-2", subject_slug: "physics" },
        { id: "note-c", user_id: "student-1", course_id: "course-1", subject_slug: "chemistry" },
      ],
      chat_sessions: [
        {
          id: "chat-a",
          user_id: "student-1",
          subject_context: "physics",
          subject_tags: ["physics"],
        },
        {
          id: "chat-b",
          user_id: "student-1",
          subject_context: "",
          subject_tags: ["physics", "chemistry"],
        },
        {
          id: "chat-c",
          user_id: "student-1",
          subject_context: "chemistry",
          subject_tags: ["chemistry"],
        },
      ],
      student_practice_attempts: [
        { id: "attempt-a", user_id: "student-1", subject_slug: "physics" },
      ],
      student_practice_answer_sheets: [
        { attempt_id: "attempt-a", storage_path: "student-1/a.pdf" },
      ],
      teacher_exam_papers: [{ id: "paper-a", teacher_id: "teacher-1", subject_slug: "physics" }],
      teacher_classrooms: [
        { id: "class-a", teacher_id: "teacher-1", course_id: "course-1", subject_slug: "physics" },
        { id: "class-b", teacher_id: "teacher-1", course_id: "course-2", subject_slug: "physics" },
      ],
      teacher_classroom_activity: [
        { id: "activity-a", classroom_id: "class-a", actor_id: "student-1" },
        { id: "activity-b", classroom_id: "class-b", actor_id: "student-1" },
      ],
      student_topic_mastery: [{ id: "mastery-a", user_id: "student-1", subject_slug: "physics" }],
      student_challenges: [{ id: "challenge-a", user_id: "student-1", subject_slug: "physics" }],
    });

    await clearStudentStudyTrails(
      admin,
      ["student-1"],
      [{ subjectSlug: "physics", courseId: "course-1" }],
      ["course-1"],
      "teacher-1",
    );

    const deletion = (table: string) =>
      operations.find((operation) => operation.table === table)?.filters || [];
    expect(deletion("revision_notes")).toContainEqual(["id", ["note-a"]]);
    expect(deletion("chat_sessions")).toContainEqual(["id", ["chat-a"]]);
    expect(deletion("student_practice_attempts")).toContainEqual(["id", ["attempt-a"]]);
    expect(deletion("student_topic_mastery")).toContainEqual(["id", ["mastery-a"]]);
    expect(deletion("student_challenges")).toContainEqual(["id", ["challenge-a"]]);
    expect(deletion("teacher_exam_submissions")).toEqual(
      expect.arrayContaining([
        ["paper_id", ["paper-a"]],
        ["student_id", ["student-1"]],
      ]),
    );
    expect(deletion("teacher_classroom_members")).toEqual(
      expect.arrayContaining([
        ["classroom_id", ["class-a"]],
        ["student_id", ["student-1"]],
      ]),
    );
    expect(deletion("teacher_classroom_activity")).toEqual(
      expect.arrayContaining([
        ["classroom_id", ["class-a"]],
        ["actor_id", ["student-1"]],
      ]),
    );
    expect(deletion("teacher_classroom_members")).not.toContainEqual(["classroom_id", ["class-b"]]);

    // The multi-subject chat and the chemistry note were not selected for deletion.
    expect(deletion("chat_sessions")).not.toContainEqual(["id", ["chat-b"]]);
    expect(deletion("revision_notes")).not.toContainEqual(["id", ["note-c"]]);
  });

  it("clears every course-owned trail even when its old subject is no longer linked", async () => {
    const { admin, operations } = makeAdmin({
      revision_notes: [
        { id: "note-a", user_id: "student-1", course_id: "course-1", subject_slug: "old" },
      ],
      chat_sessions: [
        { id: "chat-a", user_id: "student-1", course_id: "course-1", subject_slug: "old" },
        { id: "chat-b", user_id: "student-1", course_id: "course-2", subject_slug: "old" },
      ],
      student_practice_attempts: [
        { id: "attempt-a", user_id: "student-1", course_id: "course-1", subject_slug: "old" },
        { id: "attempt-b", user_id: "student-1", course_id: "course-2", subject_slug: "old" },
      ],
      student_topic_mastery: [
        { id: "mastery-a", user_id: "student-1", course_id: "course-1", subject_slug: "old" },
      ],
      student_challenges: [
        { id: "challenge-a", user_id: "student-1", course_id: "course-1", subject_slug: "old" },
      ],
      teacher_classrooms: [
        { id: "class-a", course_id: "course-1", subject_slug: "old" },
        { id: "class-b", course_id: "course-2", subject_slug: "old" },
      ],
    });

    await clearStudentStudyTrails(
      admin,
      ["student-1"],
      [{ subjectSlug: "current-subject", courseId: "course-1" }],
      ["course-1"],
      "teacher-1",
      true,
    );

    const deletion = (table: string) =>
      operations.find((operation) => operation.table === table)?.filters || [];
    expect(deletion("revision_notes")).toContainEqual(["id", ["note-a"]]);
    expect(deletion("chat_sessions")).toContainEqual(["id", ["chat-a"]]);
    expect(deletion("student_practice_attempts")).toContainEqual(["id", ["attempt-a"]]);
    expect(deletion("student_topic_mastery")).toContainEqual(["id", ["mastery-a"]]);
    expect(deletion("student_challenges")).toContainEqual(["id", ["challenge-a"]]);
    expect(deletion("teacher_classroom_members")).toContainEqual(["classroom_id", ["class-a"]]);
    expect(deletion("chat_sessions")).not.toContainEqual(["id", ["chat-b"]]);
    expect(deletion("student_practice_attempts")).not.toContainEqual(["id", ["attempt-b"]]);
  });

  it("keeps the database trail intact when uploaded answer-sheet cleanup fails", async () => {
    const { admin, operations } = makeAdmin(
      {
        revision_notes: [],
        chat_sessions: [],
        student_challenges: [],
        student_practice_attempts: [
          { id: "attempt-a", user_id: "student-1", course_id: "course-1", subject_slug: "physics" },
        ],
        student_practice_answer_sheets: [
          { attempt_id: "attempt-a", storage_path: "student-1/a.pdf" },
        ],
      },
      { message: "Storage unavailable" },
    );

    await expect(
      clearStudentStudyTrails(
        admin,
        ["student-1"],
        [{ subjectSlug: "physics", courseId: "course-1" }],
        ["course-1"],
        "teacher-1",
        true,
      ),
    ).rejects.toMatchObject({ message: "Storage unavailable" });

    expect(
      operations.some((operation) => operation.table === "student_practice_attempts"),
    ).toBe(false);
  });
});
