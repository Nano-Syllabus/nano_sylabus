import { beforeEach, describe, expect, it, vi } from "vitest";
import { communityLearningFixture } from "../helpers/learning-database";
const mocks = vi.hoisted(() => ({ topics: vi.fn() }));
vi.mock("@/lib/teacher-app/client", () => ({ getTeacherPracticeTopics: mocks.topics }));
import {
  extractedLearningTopics,
  readCommunityLearningTopics,
  readCourseLearningTopics,
} from "@/lib/data/community-learning-topics";

describe("canonical community challenge topics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.topics.mockResolvedValue({
      topics: [{ topic_key: "real-provider-id", title: "C Programming" }],
    });
  });

  it("keeps real provider IDs, ordering, and deduplicates repeated topics", () => {
    expect(
      extractedLearningTopics({
        topic_source: "syllabus",
        topics: [
          { topic_key: "c_programming", title: "C Programming", order_index: 1, unit_number: 2 },
          { topic_key: "c_programming", title: "C Programming" },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        topic_key: "c_programming",
        position: 1,
        unit_number: "2",
        source: "syllabus",
      }),
    ]);
  });

  it("carries each topic's unit name, and '' where the catalogue has none", () => {
    expect(
      extractedLearningTopics({
        topics: [
          { topic_key: "ohms_law", title: "Ohm's law", unit_number: "1", unit_title: " Basic Circuit Concepts " },
          { topic_key: "kvl", title: "KVL", unit_number: "2" },
        ],
      }).map((topic) => topic.unit_title),
    ).toEqual(["Basic Circuit Concepts", ""]);
  });

  it("still reads the catalogue before the unit-name column is migrated", async () => {
    const asked: string[] = [];
    const rows = [
      { id: "t1", community_subject_id: "subject-1", topic_key: "identifiers", title: "Identifiers", position: 0 },
    ];
    const admin = {
      from: () => ({
        select: (columns: string) => {
          asked.push(columns);
          const result = columns.includes("unit_title")
            ? { data: null, error: { code: "42703", message: "column does not exist" } }
            : { data: rows, error: null };
          const query = { in: () => query, order: async () => result };
          return query;
        },
      }),
    };
    const topics = await readCommunityLearningTopics(
      [{ id: "subject-1", name: "C Programming", teacherId: null, externalSubjectSlug: null }],
      admin as never,
    );
    expect(topics.map((topic) => topic.topic_key)).toEqual(["identifiers"]);
    expect(asked).toHaveLength(2);
    expect(asked[0]).toContain("unit_title");
    expect(asked[1]).not.toContain("unit_title");
  });

  it("keeps uploaded source documents out of the student topic catalogue", () => {
    expect(
      extractedLearningTopics({
        subject: "Applied Mechanics",
        topic_source: "stored",
        topics: [
          { topic_key: "applied_mechanics_qb", title: "Applied Mechanics QB" },
          { topic_key: "applied_mechanics_syllabus", title: "Applied mechanics syllabus" },
          { topic_key: "applied_mechanics_text_book", title: "Applied mechanics text book" },
          { topic_key: "introduction", title: "Introduction" },
        ],
      }).map((topic) => topic.topic_key),
    ).toEqual(["introduction"]);
  });

  it("refuses to invent a challenge ID from a syllabus title", () => {
    expect(() => extractedLearningTopics({ topics: [{ title: "Identifiers" }] })).toThrow(
      "usable ID",
    );
    expect(() => extractedLearningTopics({ topics: [null] })).toThrow("invalid topic");
    expect(() => extractedLearningTopics({ status: "pending" })).toThrow("topic catalogue");
    expect(extractedLearningTopics({ topics: [] })).toEqual([]);
  });

  it("uses the exact teacher + subject pair, never another teacher's matching slug", async () => {
    const db = communityLearningFixture();
    db.tables.teacher_subject_syllabi.push({
      teacher_id: "another-teacher",
      subject_slug: "teacher_nims",
      structure: [{ title: "Secret", topics: [] }],
    });
    expect(
      await readCourseLearningTopics("course-1", "teacher-1", "teacher_nims", db.admin),
    ).toEqual([]);
    expect(
      await readCourseLearningTopics("course-1", "another-teacher", "teacher_nims", db.admin),
    ).toEqual([]);
    expect(mocks.topics).not.toHaveBeenCalled();
  });

  it("reads published IDs without asking another extraction service", async () => {
    const db = communityLearningFixture();
    db.tables.community_subject_topics.push({
      id: "topic-1",
      community_subject_id: "subject-1",
      topic_key: "identifiers",
      title: "Identifiers",
      position: 0,
    });
    expect(
      (await readCourseLearningTopics("course-1", "teacher-1", "teacher_nims", db.admin))?.map(
        (row) => row.topic_key,
      ),
    ).toEqual(["identifiers"]);
    expect(mocks.topics).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalledWith("teacher_subject_syllabi");
  });

  it("filters source-document rows already stored by an older publication", async () => {
    const db = communityLearningFixture();
    db.tables.community_subjects[0].name = "Applied Mechanics";
    db.tables.community_subject_topics.push(
      {
        id: "topic-qb",
        community_subject_id: "subject-1",
        topic_key: "applied_mechanics_qb",
        title: "Applied Mechanics QB",
        position: 0,
      },
      {
        id: "topic-intro",
        community_subject_id: "subject-1",
        topic_key: "introduction",
        title: "Introduction",
        position: 1,
      },
    );

    expect(
      (await readCourseLearningTopics("course-1", "teacher-1", "teacher_nims", db.admin))?.map(
        (row) => row.topic_key,
      ),
    ).toEqual(["introduction"]);
  });

  it("recovers old unpublished syllabi through real provider topics, not outline subheadings", async () => {
    const db = communityLearningFixture();
    db.tables.teacher_subject_syllabi.push({
      teacher_id: "teacher-1",
      subject_slug: "teacher_nims",
      structure: [{ title: "Tokens", topics: [{ name: "Identifiers" }] }],
    });
    const topics = await readCourseLearningTopics(
      "course-1",
      "teacher-1",
      "teacher_nims",
      db.admin,
    );
    expect(topics?.map((row) => row.topic_key)).toEqual(["real-provider-id"]);
    expect(mocks.topics).toHaveBeenCalledExactlyOnceWith("collection", "Nims");
    expect(db.tables.community_subject_topics).toEqual([]);
  });

  it("returns no community catalogue for a legacy course and surfaces storage failures", async () => {
    const db = communityLearningFixture();
    expect(
      await readCourseLearningTopics("other-course", "teacher-1", "teacher_nims", db.admin),
    ).toBeNull();
    db.failures.set("teacher_subject_syllabi:select", "Unavailable");
    await expect(
      readCommunityLearningTopics(
        [
          {
            id: "subject-1",
            name: "Nims",
            teacherId: "teacher-1",
            externalSubjectSlug: "teacher_nims",
          },
        ],
        db.admin,
      ),
    ).rejects.toThrow("Unavailable");
  });

  it("does not turn a failed legacy recovery into an empty success", async () => {
    const db = communityLearningFixture();
    db.tables.teacher_subject_syllabi.push({
      teacher_id: "teacher-1",
      subject_slug: "teacher_nims",
      structure: [{ title: "Tokens", topics: [] }],
    });
    mocks.topics.mockRejectedValue(new Error("Learning service unavailable"));
    await expect(
      readCourseLearningTopics("course-1", "teacher-1", "teacher_nims", db.admin),
    ).rejects.toThrow("Learning service unavailable");
  });
});
