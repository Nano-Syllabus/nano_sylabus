/**
 * The Challenge Hub resolves every subject's shared catalogue before it fans out.
 *
 * Read one subject at a time this cost a `community_subjects` lookup and a topics
 * read each, so a student with thirty subjects spent sixty-odd Supabase round trips
 * on neighbouring rows of the same two tables before the page could render. What is
 * pinned here is the round-trip COUNT, because nothing about the returned data shows
 * whether it took one query or thirty.
 */
import { describe, expect, it } from "vitest";

import {
  courseLearningTopicsKey,
  readCourseLearningTopicsBatch,
} from "@/lib/data/community-learning-topics";

function fakeAdmin(tables: Record<string, unknown[]>) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(table);
      const rows = tables[table] ?? [];
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "in", "eq", "order", "not", "limit"]) {
        chain[method] = () => chain;
      }
      chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
      // Awaiting the builder itself is how the non-maybeSingle queries resolve.
      chain.then = (resolve: (value: unknown) => unknown) =>
        resolve({ data: rows, error: null });
      return chain;
    },
  };
  return { calls, client: client as never };
}

const SUBJECTS = [
  { courseId: "course-1", teacherId: "teacher-1", subjectSlug: "digital-logic" },
  { courseId: "course-1", teacherId: "teacher-1", subjectSlug: "engineering-physics" },
  { courseId: "course-1", teacherId: "teacher-1", subjectSlug: "applied-mechanics" },
  { courseId: "course-1", teacherId: "teacher-1", subjectSlug: "numerical-methods" },
];

describe("readCourseLearningTopicsBatch", () => {
  it("reads community_subjects once for many subjects, not once each", async () => {
    const { calls, client } = fakeAdmin({
      communities: [{ id: "community-1" }],
      community_subjects: SUBJECTS.map((subject, index) => ({
        id: `cs-${index}`,
        name: subject.subjectSlug,
        teacher_id: subject.teacherId,
        external_subject_slug: subject.subjectSlug,
        community_id: "community-1",
      })),
      community_subject_topics: SUBJECTS.map((subject, index) => ({
        id: `t-${index}`,
        community_subject_id: `cs-${index}`,
        topic_key: `topic-${index}`,
        title: `Topic ${index}`,
        blurb: "",
        unit_number: null,
        position: index,
        source: "syllabus",
      })),
    });

    const result = await readCourseLearningTopicsBatch(SUBJECTS, client);

    expect(calls.filter((table) => table === "community_subjects")).toHaveLength(1);
    expect(calls.filter((table) => table === "community_subject_topics")).toHaveLength(1);
    // Every subject still got its own topics back.
    for (const [index, subject] of SUBJECTS.entries()) {
      const topics = result.get(courseLearningTopicsKey(subject));
      expect(topics?.map((topic) => topic.topic_key)).toEqual([`topic-${index}`]);
    }
  });

  it("keeps null and [] apart, because the caller branches on it", async () => {
    // No community owns the course -> null -> the caller asks the creator service.
    const unowned = fakeAdmin({ communities: [] });
    const nullResult = await readCourseLearningTopicsBatch([SUBJECTS[0]], unowned.client);
    expect(nullResult.get(courseLearningTopicsKey(SUBJECTS[0]))).toBeNull();
    expect(unowned.calls).not.toContain("community_subjects");

    // A community owns it but publishes nothing -> [] -> no fallback.
    const owned = fakeAdmin({ communities: [{ id: "community-1" }], community_subjects: [] });
    const emptyResult = await readCourseLearningTopicsBatch([SUBJECTS[0]], owned.client);
    expect(emptyResult.get(courseLearningTopicsKey(SUBJECTS[0]))).toEqual([]);
  });

  it("does nothing, and asks nothing, for no subjects", async () => {
    const { calls, client } = fakeAdmin({});
    expect((await readCourseLearningTopicsBatch([], client)).size).toBe(0);
    expect(calls).toHaveLength(0);
  });
});
