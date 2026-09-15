import { beforeEach, describe, expect, it, vi } from "vitest";
import { communityLearningFixture } from "../helpers/learning-database";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  access: vi.fn(),
  creatorAccess: vi.fn(),
  topics: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/lib/student-courses", () => ({
  listStudentCommunitySubjectAccess: mocks.access,
  // A creator revising their own private subjects. Defaults to none so the
  // community cases below stay about community access.
  listCreatorPrivateSubjectAccess: mocks.creatorAccess,
}));
// Defined inside the factory: `vi.mock` is hoisted above every const, so a helper
// declared outside it is still in the temporal dead zone when the factory runs.
vi.mock("@/lib/data/community-learning-topics", () => {
  const key = (request: { courseId: string; teacherId: string; subjectSlug: string }) =>
    `${request.courseId}\u0000${request.teacherId}\u0000${request.subjectSlug}`;
  return {
    readCourseLearningTopics: mocks.topics,
    courseLearningTopicsKey: key,
    // Revision reads every subject's catalogue in one batch. Expressed through the
    // same `mocks.topics` the cases below already drive, so `mockResolvedValue`
    // still answers for every subject and `mockRejectedValue` still fails the read
    // — the batch fails whole, which is the behaviour being relied on.
    readCourseLearningTopicsBatch: async (
      requests: Array<{ courseId: string; teacherId: string; subjectSlug: string }>,
    ) => {
      const resolved = new Map<string, unknown>();
      for (const request of requests) {
        resolved.set(
          key(request),
          await mocks.topics(request.courseId, request.teacherId, request.subjectSlug),
        );
      }
      return resolved;
    },
  };
});

import { getStudentRevisionDocs } from "@/lib/data/student-revision-docs";

/**
 * What these guard is the claim the revision docs make about every page in them:
 * "you worked through this, and here is what it said."
 *
 * So: challenges that have been opened (passed or still in progress, and never one
 * with no material yet), only subjects the student still has, in the curriculum's
 * own order, with the reading read back rather than regenerated.
 */

const SUBJECT_ACCESS = {
  courseId: "course-1",
  teacherId: "teacher-1",
  subjectSlug: "teacher_nims",
  subjectName: "Nims",
  folderPath: "Nims",
  accessKind: "community" as const,
  community: { id: "community-1", name: "Henglish" },
  term: { id: "term-3", yearNumber: 2, semesterNumber: 3, semesterInYear: 1, position: 2 },
};

function completedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "challenge-a",
    user_id: "member",
    course_id: "course-1",
    subject_slug: "teacher_nims",
    subject_name: "Nims",
    topic_key: "laplace",
    topic_title: "Laplace Transform",
    title: "Laplace Transform",
    status: "completed",
    attempt_count: 1,
    last_score: 16,
    last_total_marks: 20,
    completed_at: "2026-09-10T10:00:00.000Z",
    content: {
      lesson: {
        title: "What you need to know",
        bigIdea: "It turns a differential equation into an algebraic one.",
        content: ["The transform maps t to s.", "Linearity is what makes it usable."],
        focus: "Transforming a derivative.",
        connections: ["Used by transfer functions in the next unit."],
      },
      pastQuestions: [{ id: "past-1", question: "Obtain the transform of f(t).", year: "2079" }],
      solvedExamples: [{ question: "Transform e^{-at}.", solution: "1/(s+a)" }],
    },
    ...overrides,
  };
}

describe("revision docs", () => {
  let db: ReturnType<typeof communityLearningFixture>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = communityLearningFixture();
    db.tables.student_challenges = [completedRow()];
    mocks.admin.mockReturnValue(db.admin);
    mocks.access.mockResolvedValue([SUBJECT_ACCESS]);
    mocks.creatorAccess.mockResolvedValue([]);
    mocks.topics.mockResolvedValue([
      { topic_key: "laplace", title: "Laplace Transform", unit_number: "2", position: 4 },
    ]);
  });

  it("files a passed challenge under semester, subject and unit", async () => {
    const docs = await getStudentRevisionDocs("member");

    expect(docs.topicCount).toBe(1);
    const [semester] = docs.semesters;
    expect(semester.label).toBe("Year 2 · Semester 3");
    expect(semester.subjects[0].name).toBe("Nims");
    expect(semester.subjects[0].units[0].label).toBe("Unit 2");
    expect(semester.subjects[0].units[0].topics[0].title).toBe("Laplace Transform");
  });

  it("reads the challenge's own material back rather than regenerating it", async () => {
    const docs = await getStudentRevisionDocs("member");
    const topic = docs.semesters[0].subjects[0].units[0].topics[0];

    expect(topic.bigIdea).toBe("It turns a differential equation into an algebraic one.");
    expect(topic.reading).toHaveLength(2);
    expect(topic.connections).toEqual(["Used by transfer functions in the next unit."]);
    expect(topic.pastQuestions[0].question).toBe("Obtain the transform of f(t).");
    expect(topic.solvedExamples[0].solution).toBe("1/(s+a)");
    // The id a student quotes when a page's material is wrong.
    expect(topic.challengeId).toBe("challenge-a");
    expect(topic.scorePercent).toBe(80);
  });

  it("drops a challenge whose subject the student no longer has", async () => {
    mocks.access.mockResolvedValue([]);

    const docs = await getStudentRevisionDocs("member");

    // The row is still there and still completed. Leaving the community takes
    // its material with it, exactly as opening the challenge itself would find.
    expect(docs.topicCount).toBe(0);
    expect(docs.semesters).toEqual([]);
  });

  it("orders units by the curriculum, not by when they were passed", async () => {
    db.tables.student_challenges = [
      completedRow({ id: "challenge-late", topic_key: "stability", topic_title: "Stability" }),
      completedRow(),
    ];
    mocks.topics.mockResolvedValue([
      { topic_key: "stability", title: "Stability", unit_number: "7", position: 9 },
      { topic_key: "laplace", title: "Laplace Transform", unit_number: "2", position: 4 },
    ]);

    const docs = await getStudentRevisionDocs("member");

    expect(docs.semesters[0].subjects[0].units.map((unit) => unit.label)).toEqual([
      "Unit 2",
      "Unit 7",
    ]);
  });

  it("keeps a topic its course catalogue cannot place", async () => {
    // Losing the reading because a unit label could not be looked up would be
    // the wrong trade by a wide margin.
    mocks.topics.mockRejectedValue(new Error("catalogue unavailable"));

    const docs = await getStudentRevisionDocs("member");

    expect(docs.topicCount).toBe(1);
    expect(docs.semesters[0].subjects[0].units[0].label).toBe("Other topics");
    expect(docs.semesters[0].subjects[0].units[0].topics[0].title).toBe("Laplace Transform");
  });

  it("files a challenge that is still in progress, and marks it as such", async () => {
    // The reading is written by `/start`, so a student midway through a topic
    // already has the material this page exists to hand back. Withholding it
    // until they pass hides precisely the topic they are working on today.
    db.tables.student_challenges = [
      completedRow({ id: "challenge-open", status: "started", completed_at: null }),
    ];

    const docs = await getStudentRevisionDocs("member");

    const topic = docs.semesters[0].subjects[0].units[0].topics[0];
    expect(topic.title).toBe("Laplace Transform");
    expect(topic.inProgress).toBe(true);
    // The reading is the whole point — it must come back intact, not stubbed.
    expect(topic.reading.length).toBeGreaterThan(0);
  });

  it("does not file a challenge that has no material yet", async () => {
    // Assigned but never opened: filing it would put an empty page under a real
    // topic title, which reads as "this taught you nothing" rather than "not yet".
    db.tables.student_challenges = [
      completedRow({ id: "challenge-empty", status: "started", completed_at: null, content: null }),
    ];

    const docs = await getStudentRevisionDocs("member");

    expect(docs.topicCount).toBe(0);
    expect(docs.semesters).toEqual([]);
  });

  it("never calls an unfinished topic passed", async () => {
    db.tables.student_challenges = [
      completedRow({ id: "challenge-open", status: "started", completed_at: null }),
      completedRow({ id: "challenge-done", topic_key: "fourier", topic_title: "Fourier Series" }),
    ];

    const docs = await getStudentRevisionDocs("member");

    const byTitle = new Map(
      docs.semesters[0].subjects[0].units.flatMap((unit) => unit.topics).map((t) => [t.title, t]),
    );
    expect(byTitle.get("Laplace Transform")?.inProgress).toBe(true);
    expect(byTitle.get("Fourier Series")?.inProgress).toBe(false);
  });

  it("files the challenge under the unit written on its own row when the catalogue has moved on", async () => {
    // `/start` rewrites `topic_key` to whatever the provider resolved, so the
    // catalogue join misses and the topic used to fall into "Other topics" — the
    // docs quietly losing the syllabus structure they exist to present.
    db.tables.student_challenges = [completedRow({ topic_key: "laplace-v2", unit_number: "2" })];
    mocks.topics.mockResolvedValue([
      { topic_key: "laplace", title: "Laplace Transform", unit_number: "2", position: 4 },
    ]);

    const docs = await getStudentRevisionDocs("member");

    expect(docs.semesters[0].subjects[0].units[0].label).toBe("Unit 2");
  });

  it("keeps a challenge that has no course, matched on its subject", async () => {
    // A creator studying their own uploaded material: no community, no course,
    // authorised by subject alone — exactly as `requireChallengeAccess` finds it.
    db.tables.student_challenges = [completedRow({ course_id: null })];
    mocks.access.mockResolvedValue([]);
    mocks.creatorAccess.mockResolvedValue([
      {
        courseId: "private:profile-1",
        teacherId: "teacher-1",
        subjectSlug: "teacher_nims",
        subjectName: "Nims",
        folderPath: "Nims",
        accessKind: "owner-private" as const,
      },
    ]);

    const docs = await getStudentRevisionDocs("member");

    expect(docs.topicCount).toBe(1);
    expect(docs.semesters[0].subjects[0].name).toBe("Nims");
  });

  it("says a reading still being written is coming, not that it was never kept", async () => {
    db.tables.student_challenges = [
      completedRow({
        status: "started",
        completed_at: null,
        content: { contentStatus: "pending", lesson: { content: [] }, pastQuestions: [] },
      }),
    ];

    const docs = await getStudentRevisionDocs("member");
    const topic = docs.semesters[0].subjects[0].units[0].topics[0];

    // Filed the moment the challenge opens — the student can see the page exists
    // — and the page itself says the reading is on its way.
    expect(topic.reading).toEqual([]);
    expect(topic.readingPending).toBe(true);
  });

  it("does not promise a reading whose build has already finished without one", async () => {
    db.tables.student_challenges = [
      completedRow({ content: { contentStatus: "ready", lesson: { content: [] } } }),
    ];

    const docs = await getStudentRevisionDocs("member");

    expect(docs.semesters[0].subjects[0].units[0].topics[0].readingPending).toBe(false);
  });

  it("still renders when the unit column has not been migrated yet", async () => {
    // Code reaches a deployment before its migration does. For that window
    // `unit_number` does not exist and Postgres answers 42703 — which used to
    // take the whole section down over a field that only groups topics.
    const rows = [completedRow()];
    let askedFor = "";
    let attempts = 0;
    mocks.admin.mockReturnValue({
      from: () => ({
        select: (columns: string) => {
          askedFor = columns;
          attempts += 1;
          const result =
            attempts === 1
              ? { data: null, error: { code: "42703" } }
              : { data: rows, error: null };
          return { eq: () => ({ in: () => ({ order: async () => result }) }) };
        },
      }),
    });

    const docs = await getStudentRevisionDocs("member");

    expect(attempts).toBe(2);
    // The retry drops the column rather than the query.
    expect(askedFor).not.toContain("unit_number");
    expect(docs.unavailable).toBe(false);
    expect(docs.topicCount).toBe(1);
    // Placement falls back to the live catalogue, which is what it did before
    // the column existed.
    expect(docs.semesters[0].subjects[0].units[0].label).toBe("Unit 2");
  });

  it("places a topic by title when /start rewrote its key", async () => {
    // The reported symptom: "Oscillation" sitting under OTHER TOPICS beside the
    // real syllabus units, because the row's key no longer matches the catalogue.
    db.tables.student_challenges = [
      completedRow({ topic_key: "laplace-v2-provider", unit_number: "" }),
    ];

    const docs = await getStudentRevisionDocs("member");

    expect(docs.semesters[0].subjects[0].units[0].label).toBe("Unit 2");
  });

  it("refuses to guess when two topics in a subject share a title", async () => {
    // "Introduction" lives under three different units in a typical syllabus.
    // Filing under the wrong one is worse than filing under Other topics.
    db.tables.student_challenges = [
      completedRow({ topic_key: "unknown-key", topic_title: "Introduction", unit_number: "" }),
    ];
    mocks.topics.mockResolvedValue([
      { topic_key: "intro-1", title: "Introduction", unit_number: "1", position: 0 },
      { topic_key: "intro-2", title: "Introduction", unit_number: "4", position: 9 },
    ]);

    const docs = await getStudentRevisionDocs("member");

    expect(docs.semesters[0].subjects[0].units[0].label).toBe("Other topics");
  });

  it("reports a missing challenge table as unavailable, not as nothing revised", async () => {
    db.tables.student_challenges = [];
    db.failures.set("student_challenges:select", "missing");
    mocks.admin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            in: () => ({
              order: () => Promise.resolve({ data: null, error: { code: "42P01" } }),
            }),
          }),
        }),
      }),
    });

    const docs = await getStudentRevisionDocs("member");

    expect(docs.unavailable).toBe(true);
    expect(docs.semesters).toEqual([]);
  });
});
