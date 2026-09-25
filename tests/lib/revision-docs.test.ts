import { beforeEach, describe, expect, it, vi } from "vitest";
import { communityLearningFixture } from "../helpers/learning-database";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  access: vi.fn(),
  creatorAccess: vi.fn(),
  topics: vi.fn(),
  noUnitOne: false,
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
        const topics = await mocks.topics(request.courseId, request.teacherId, request.subjectSlug);
        // Every catalogue counts its units from 1 unless a case says otherwise:
        // one that does not names no units at all (see `lib/unit-numbering.ts`).
        resolved.set(
          key(request),
          Array.isArray(topics) && !mocks.noUnitOne
            ? [{ topic_key: "__unit-one", title: "Unit one opener", unit_number: "1", position: -1 }, ...topics]
            : topics,
        );
      }
      return resolved;
    },
  };
});

import { getStudentRevisionDocs } from "@/lib/data/student-revision-docs";

type Docs = Awaited<ReturnType<typeof getStudentRevisionDocs>>;

/**
 * The docs with the syllabus outline taken out: only the pages a challenge
 * filed. Most cases below are about filing, and predate the outline; the outline
 * has its own cases at the end.
 */
async function filedDocs(userId: string, options?: { unlockAll?: boolean }): Promise<Docs> {
  const docs = await getStudentRevisionDocs(userId, options);
  const semesters = docs.semesters
    .map((semester) => {
      const subjects = semester.subjects
        .map((subject) => {
          const units = subject.units
            .map((unit) => ({ ...unit, topics: unit.topics.filter((topic) => topic.state === "filed") }))
            .filter((unit) => unit.topics.length);
          const topicCount = units.reduce((sum, unit) => sum + unit.topics.length, 0);
          return { ...subject, units, topicCount };
        })
        .filter((subject) => subject.topicCount);
      return {
        ...semester,
        subjects,
        topicCount: subjects.reduce((sum, subject) => sum + subject.topicCount, 0),
      };
    })
    .filter((semester) => semester.topicCount);
  return { ...docs, semesters, topicCount: docs.filedCount };
}

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
    mocks.noUnitOne = false;
    db = communityLearningFixture();
    db.tables.student_challenges = [completedRow()];
    mocks.admin.mockReturnValue(db.admin);
    mocks.access.mockResolvedValue([SUBJECT_ACCESS]);
    mocks.creatorAccess.mockResolvedValue([]);
    mocks.topics.mockResolvedValue([
      { topic_key: "laplace", title: "Laplace Transform", unit_number: "2", position: 4 },
    ]);
  });

  it("names no units in a subject whose syllabus does not count them from 1", async () => {
    // A licence subject is chapter 7 of a larger syllabus: its units are 7.1,
    // 7.2 … and read as six missing units (user, 2026-09-24).
    mocks.noUnitOne = true;
    mocks.topics.mockResolvedValue([
      { topic_key: "laplace", title: "Laplace Transform", unit_number: "7.1", position: 4 },
    ]);
    const docs = await filedDocs("member");
    const units = docs.semesters[0].subjects[0].units;
    expect(units.map((unit) => unit.label)).toEqual([""]);
    expect(units[0].topics[0].title).toBe("Laplace Transform");
  });

  it("files a passed challenge under semester, subject and unit", async () => {
    const docs = await filedDocs("member");

    expect(docs.topicCount).toBe(1);
    const [semester] = docs.semesters;
    expect(semester.label).toBe("Year 2 · Semester 3");
    expect(semester.subjects[0].name).toBe("Nims");
    expect(semester.subjects[0].units[0].label).toBe("Unit 2");
    expect(semester.subjects[0].units[0].topics[0].title).toBe("Laplace Transform");
  });

  it("reads the challenge's own material back rather than regenerating it", async () => {
    const docs = await filedDocs("member");
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

    const docs = await filedDocs("member");

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

    const docs = await filedDocs("member");

    expect(docs.semesters[0].subjects[0].units.map((unit) => unit.label)).toEqual([
      "Unit 2",
      "Unit 7",
    ]);
  });

  it("keeps a topic its course catalogue cannot place", async () => {
    // Losing the reading because a unit label could not be looked up would be
    // the wrong trade by a wide margin.
    mocks.topics.mockRejectedValue(new Error("catalogue unavailable"));

    const docs = await filedDocs("member");

    expect(docs.topicCount).toBe(1);
    expect(docs.semesters[0].subjects[0].units[0].label).toBe(""); // one plain list: nothing to number it by
    expect(docs.semesters[0].subjects[0].units[0].topics[0].title).toBe("Laplace Transform");
  });

  it("files a challenge that is still in progress, and marks it as such", async () => {
    // The reading is written by `/start`, so a student midway through a topic
    // already has the material this page exists to hand back. Withholding it
    // until they pass hides precisely the topic they are working on today.
    db.tables.student_challenges = [
      completedRow({ id: "challenge-open", status: "started", completed_at: null }),
    ];

    const docs = await filedDocs("member");

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

    const docs = await filedDocs("member");

    expect(docs.topicCount).toBe(0);
    expect(docs.semesters).toEqual([]);
  });

  it("never calls an unfinished topic passed", async () => {
    db.tables.student_challenges = [
      completedRow({ id: "challenge-open", status: "started", completed_at: null }),
      completedRow({ id: "challenge-done", topic_key: "fourier", topic_title: "Fourier Series" }),
    ];

    const docs = await filedDocs("member");

    const byTitle = new Map(
      docs.semesters[0].subjects[0].units.flatMap((unit) => unit.topics).map((t) => [t.title, t]),
    );
    expect(byTitle.get("Laplace Transform")?.inProgress).toBe(true);
    expect(byTitle.get("Fourier Series")?.inProgress).toBe(false);
  });

  it("names each unit from the catalogue, beside its number", async () => {
    mocks.topics.mockResolvedValue([
      { topic_key: "laplace", title: "Laplace Transform", unit_number: "2", unit_title: "Transforms", position: 4 },
    ]);
    const unit = (await filedDocs("member")).semesters[0].subjects[0].units[0];
    expect([unit.label, unit.title]).toEqual(["Unit 2", "Transforms"]);

    // A topic the catalogue has dropped, filed by the unit on its own row, still
    // gets that unit's name from the unit's other topics.
    db.tables.student_challenges = [completedRow({ topic_key: "laplace-v2", topic_title: "Old name", unit_number: "2" })];
    mocks.topics.mockResolvedValue([
      { topic_key: "z-transform", title: "Z Transform", unit_number: "2", unit_title: "Transforms", position: 5 },
    ]);
    expect((await filedDocs("member")).semesters[0].subjects[0].units[0].title).toBe("Transforms");

    // A catalogue synced before names were: the number alone, as before.
    mocks.topics.mockResolvedValue([
      { topic_key: "laplace", title: "Laplace Transform", unit_number: "2", position: 4 },
    ]);
    db.tables.student_challenges = [completedRow()];
    expect((await filedDocs("member")).semesters[0].subjects[0].units[0].title).toBe("");
  });

  it("files the challenge under the unit written on its own row when the catalogue has moved on", async () => {
    // `/start` rewrites `topic_key` to whatever the provider resolved, so the
    // catalogue join misses and the topic used to fall into "Other topics" — the
    // docs quietly losing the syllabus structure they exist to present.
    db.tables.student_challenges = [completedRow({ topic_key: "laplace-v2", unit_number: "2" })];
    mocks.topics.mockResolvedValue([
      { topic_key: "laplace", title: "Laplace Transform", unit_number: "2", position: 4 },
    ]);

    const docs = await filedDocs("member");

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

    const docs = await filedDocs("member");

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

    const docs = await filedDocs("member");
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

    const docs = await filedDocs("member");

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

    const docs = await filedDocs("member");

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

    const docs = await filedDocs("member");

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

    const docs = await filedDocs("member");

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

    const docs = await filedDocs("member");

    expect(docs.unavailable).toBe(true);
    expect(docs.semesters).toEqual([]);
  });
});

describe("revision docs: one entry per topic, one copy per question", () => {
  let db: ReturnType<typeof communityLearningFixture>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = communityLearningFixture();
    mocks.admin.mockReturnValue(db.admin);
    mocks.access.mockResolvedValue([SUBJECT_ACCESS]);
    mocks.creatorAccess.mockResolvedValue([]);
    mocks.topics.mockResolvedValue([
      { topic_key: "laplace", title: "Laplace Transform", unit_number: "2", position: 4 },
    ]);
  });

  const unitTopics = (docs: Docs) =>
    docs.semesters[0].subjects[0].units[0].topics;

  it("lists a topic sat twice once, and counts it once", async () => {
    // Passed on the 10th, then assigned again and started on the 12th.
    db.tables.student_challenges = [
      completedRow({
        id: "challenge-again", status: "started", completed_at: null,
        updated_at: "2026-09-12T10:00:00.000Z", attempt_count: 0,
      }),
      completedRow({ updated_at: "2026-09-10T10:00:00.000Z" }),
    ];

    const docs = await filedDocs("member");

    expect(unitTopics(docs).map((topic) => topic.title)).toEqual(["Laplace Transform"]);
    expect(docs.topicCount).toBe(1);
    expect(docs.semesters[0].topicCount).toBe(1);
    // The passed sitting is the page shown, even though the started one is newer.
    expect(unitTopics(docs)[0].challengeId).toBe("challenge-a");
    expect(unitTopics(docs)[0].inProgress).toBe(false);
  });

  it("keeps the newest of two passed sittings, and counts every attempt", async () => {
    db.tables.student_challenges = [
      completedRow({ id: "challenge-new", updated_at: "2026-09-14T10:00:00.000Z", attempt_count: 2 }),
      completedRow({ id: "challenge-old", updated_at: "2026-09-10T10:00:00.000Z", attempt_count: 1 }),
    ];

    const [topic] = unitTopics(await filedDocs("member"));

    expect(topic.challengeId).toBe("challenge-new");
    expect(topic.attempts).toBe(3);
  });

  it("treats a re-keyed topic with the same title in the same unit as the same topic", async () => {
    db.tables.student_challenges = [
      completedRow({ id: "challenge-rekeyed", topic_key: "laplace-transform", updated_at: "2026-09-14T10:00:00.000Z" }),
      completedRow({ updated_at: "2026-09-10T10:00:00.000Z" }),
    ];

    expect(unitTopics(await filedDocs("member"))).toHaveLength(1);
  });

  it("keeps two topics that only share a title across different units", async () => {
    mocks.topics.mockResolvedValue([
      { topic_key: "intro-1", title: "Introduction", unit_number: "1", position: 1 },
      { topic_key: "intro-3", title: "Introduction", unit_number: "3", position: 9 },
    ]);
    db.tables.student_challenges = [
      completedRow({ id: "c1", topic_key: "intro-1", topic_title: "Introduction", title: "Introduction" }),
      completedRow({ id: "c3", topic_key: "intro-3", topic_title: "Introduction", title: "Introduction" }),
    ];

    const docs = await filedDocs("member");

    expect(docs.topicCount).toBe(2);
    expect(docs.semesters[0].subjects[0].units.map((unit) => unit.label)).toEqual(["Unit 1", "Unit 3"]);
  });

  it("never folds two different topics of one unit into one", async () => {
    mocks.topics.mockResolvedValue([
      { topic_key: "laplace", title: "Laplace Transform", unit_number: "2", position: 4 },
      { topic_key: "inverse", title: "Inverse Laplace Transform", unit_number: "2", position: 5 },
    ]);
    db.tables.student_challenges = [
      completedRow(),
      completedRow({ id: "challenge-b", topic_key: "inverse", topic_title: "Inverse Laplace Transform" }),
    ];

    const docs = await filedDocs("member");

    expect(unitTopics(docs).map((topic) => topic.title)).toEqual([
      "Laplace Transform",
      "Inverse Laplace Transform",
    ]);
    expect(docs.topicCount).toBe(2);
  });

  it("does not list a past question again when it is also shown worked", async () => {
    db.tables.student_challenges = [
      completedRow({
        content: {
          lesson: { title: "t", content: ["Reading."] },
          pastQuestions: [
            // The same question, differing only in case, spacing and final mark.
            { id: "p1", question: "What is Mechanics? Define Rigid body and Deform body.", year: "2073 Magh" },
            { id: "p2", question: "What do you mean by the study of statics.", year: "2071 Bhadra" },
          ],
          solvedExamples: [
            { question: "what is mechanics?  Define rigid body and deform body", solution: "Mechanics is ..." },
          ],
        },
      }),
    ];

    const [topic] = unitTopics(await filedDocs("member"));

    expect(topic.pastQuestions.map((question) => question.id)).toEqual(["p2"]);
    expect(topic.solvedExamples).toHaveLength(1);
  });

  describe("syllabus outline", () => {
    beforeEach(() => {
      db.tables.student_challenges = [completedRow()];
    });

    const outline = (docs: Docs) =>
      docs.semesters[0].subjects[0].units.flatMap((unit) =>
        unit.topics.map((topic) => [topic.title, topic.state]),
      );

    it("lists the rest of the syllabus locked on Free, beside what was filed", async () => {
      const docs = await getStudentRevisionDocs("member");
      expect(outline(docs)).toEqual([
        ["Unit one opener", "locked"],
        ["Laplace Transform", "filed"],
      ]);
      expect(docs.topicCount).toBe(2);
      expect(docs.filedCount).toBe(1);
    });

    it("unlocks every topic for a plan that opens them all", async () => {
      const docs = await getStudentRevisionDocs("member", { unlockAll: true });
      expect(outline(docs)).toEqual([
        ["Unit one opener", "unlocked"],
        ["Laplace Transform", "filed"],
      ]);
    });

    it("opens the topic the queue has reached, and never lists it twice", async () => {
      db.tables.student_challenges = [
        completedRow(),
        completedRow({
          id: "challenge-q",
          topic_key: "__unit-one",
          topic_title: "Unit one opener",
          title: "Unit one opener",
          status: "assigned",
          content: null,
        }),
      ];
      const docs = await getStudentRevisionDocs("member");
      expect(outline(docs)).toEqual([
        ["Unit one opener", "assigned"],
        ["Laplace Transform", "filed"],
      ]);
      expect(docs.semesters[0].subjects[0].units[0].topics[0].challengeId).toBe("challenge-q");
      expect(docs.filedCount).toBe(1);
    });

    it("prefers an opened sitting of a topic over one only queued", async () => {
      db.tables.student_challenges = [
        completedRow({ id: "challenge-new", status: "assigned", content: null }),
        completedRow(),
      ];
      const docs = await getStudentRevisionDocs("member");
      const laplace = docs.semesters[0].subjects[0].units
        .flatMap((unit) => unit.topics)
        .find((topic) => topic.title === "Laplace Transform");
      expect(laplace?.state).toBe("filed");
      expect(laplace?.challengeId).toBe("challenge-a");
      expect(docs.filedCount).toBe(1);
    });

    it("lists a subject nothing has been started in, all of it locked", async () => {
      db.tables.student_challenges = [];
      const docs = await getStudentRevisionDocs("member");
      expect(outline(docs)).toEqual([
        ["Unit one opener", "locked"],
        ["Laplace Transform", "locked"],
      ]);
      expect(docs.filedCount).toBe(0);
    });
  });
});
