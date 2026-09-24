import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { communityLearningFixture } from "../helpers/learning-database";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  access: vi.fn(),
  prepare: vi.fn(),
  revision: vi.fn(),
  pastQuestions: vi.fn(),
  reading: vi.fn(),
  solved: vi.fn(),
  practiceTopics: vi.fn(),
  createExam: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/lib/student-courses", () => ({
  getStudentCourseSubjectAccessForCourse: mocks.access,
  getStudentCourseSubjectAccess: mocks.access,
  getStudentCourseSubjectAccessCached: mocks.access,
}));
vi.mock("@/lib/teacher-app/client", async (original) => ({
  ...(await original<typeof import("@/lib/teacher-app/client")>()),
  prepareTeacherChallengeTopic: mocks.prepare,
  getTeacherChallengeRevision: mocks.revision,
  getTeacherChallengePastQuestions: mocks.pastQuestions,
  getTeacherChallengeReading: mocks.reading,
  getTeacherChallengeSolvedQuestions: mocks.solved,
  getTeacherPracticeTopics: mocks.practiceTopics,
  createTeacherChallengeExam: mocks.createExam,
}));

import {
  CHALLENGE_POOL_AHEAD,
  CHALLENGE_POOL_MAX_ATTEMPTS,
  CHALLENGE_POOL_PRIORITY,
  enqueueChallengeTopics,
  readyPoolSnapshot,
  resetChallengePoolState,
  sweepChallengePool,
} from "@/lib/data/challenge-pool";
import {
  nepaliChallengeDate,
  recordStudentChallengeGrade,
  restartStudentChallenge,
  scheduleChallengeWarmups,
  startStudentChallenge,
} from "@/lib/data/student-challenges";
import { TeacherApiError } from "@/lib/teacher-app/client";
import { invalidateMemo } from "@/lib/http/memo";

/**
 * The global challenge pool.
 *
 * A topic's past questions, worked answers and reading are the same for every
 * student on it, so they are prepared once per course — ahead of the students,
 * by a sweep that claims work through a lease — and a student's challenge is
 * cut from the prepared bank with nothing asked upstream but their own paper.
 */

type Row = Record<string, unknown>;

const TOPICS = ["Tokens", "Identifiers", "Keywords", "Operators", "Expressions", "Statements"];
const MINUTE = 60_000;

const bankQuestions = Array.from({ length: 12 }, (_, index) => ({
  id: `pq${index}`,
  text: `Past question ${index}: why does rule ${index} hold?`,
  year: "2079",
  marks: 5,
}));
const bank = {
  past_questions: bankQuestions,
  solved: bankQuestions.map((question) => ({
    id: question.id,
    text: question.text,
    solution: `Worked: ${question.text}`,
    topic: "Identifiers",
    topic_key: "t1",
    source: "question_bank",
  })),
  reading: {
    headline: "Identifiers",
    content: "Identifiers name things.\n\nThey follow the language's naming rules.",
    focus: "Identifiers",
    sources: [],
  },
  topics: [{ topic_key: "t1", title: "Identifiers", order_index: 1 }],
};

function poolRow(topicKey: string, values: Row = {}): Row {
  const index = Number(topicKey.slice(1));
  return {
    id: `pool-${topicKey}`,
    course_id: "course-1",
    teacher_id: "teacher-1",
    community_subject_id: "subject-1",
    subject_slug: "teacher_nims",
    subject_name: "Nims",
    topic_key: topicKey,
    topic_title: TOPICS[index] ?? topicKey,
    position: index,
    status: "queued",
    priority: 0,
    attempts: 0,
    ...values,
  };
}

function studentRow(id: string, topicKey: string, values: Row = {}): Row {
  const index = Number(topicKey.slice(1));
  return {
    id,
    user_id: "member",
    course_id: "course-1",
    challenge_date: nepaliChallengeDate(),
    position: 0,
    subject_slug: "teacher_nims",
    subject_name: "Nims",
    topic_key: topicKey,
    topic_title: TOPICS[index] ?? topicKey,
    status: "assigned",
    ...values,
  };
}

const readyResponse = (topic: string) => ({
  state: "ready",
  subject: "Nims",
  topic,
  revision: `bank-${topic}`,
  collection_revision: "rev-1",
  manifest: {
    past_question_count: 12,
    solved_count: 12,
    unsolved_count: 0,
    has_reading: true,
    exam_pool_depth: 8,
    figure_count: 0,
    figures_ready: true,
  },
  content: bank,
  error: null,
});

describe("the global challenge pool", () => {
  let db: ReturnType<typeof communityLearningFixture>;
  const pool = () => db.tables.challenge_topic_pool as Row[];
  const topic = (key: string) => pool().find((row) => row.topic_key === key) as Row;
  const student = (id: string) =>
    (db.tables.student_challenges as Row[]).find((row) => row.id === id) as Row;

  beforeEach(() => {
    vi.clearAllMocks();
    invalidateMemo("challenge:collection-sk");
    resetChallengePoolState();
    process.env.CHALLENGE_POOL_INLINE_SWEEP = "0";
    db = communityLearningFixture();
    db.tables.community_subject_topics = [
      ...TOPICS.map((title, index) => ({
        id: `topic-${index}`,
        community_subject_id: "subject-1",
        topic_key: `t${index}`,
        title,
        blurb: "",
        unit_number: "1",
        position: index,
        source: "syllabus",
      })),
      // A source document, not a chapter: never a challenge, never pooled.
      {
        id: "topic-qb",
        community_subject_id: "subject-1",
        topic_key: "nims-qb",
        title: "Nims QB",
        blurb: "",
        unit_number: null,
        position: 0,
        source: "syllabus",
      },
    ];
    db.tables.challenge_topic_pool = [];
    db.tables.student_challenges = [];
    // The claim, as the migration writes it: claimable rows by priority then
    // syllabus order, leased to the caller in one step. (Its SQL is exercised
    // against Postgres in challenge-topic-pool-migration.test.ts.)
    db.rpcs.claim_challenge_topic_pool = (args) => {
      const { p_owner, p_limit, p_lease_seconds } = args as {
        p_owner: string;
        p_limit: number;
        p_lease_seconds: number;
      };
      const now = Date.now();
      const due = (value: unknown) => !value || Date.parse(String(value)) <= now;
      return pool()
        .filter(
          (row) =>
            (["queued", "stale", "failed"].includes(String(row.status)) &&
              due(row.next_attempt_at)) ||
            (row.status === "building" && due(row.lease_expires_at)),
        )
        .sort(
          (left, right) =>
            Number(right.priority) - Number(left.priority) ||
            Number(left.position) - Number(right.position),
        )
        .slice(0, p_limit)
        .map((row) => {
          const prior = row.status;
          Object.assign(row, {
            status: "building",
            lease_owner: p_owner,
            lease_expires_at: new Date(now + p_lease_seconds * 1000).toISOString(),
            started_at: new Date(now).toISOString(),
          });
          return { ...row, prior_status: prior };
        });
    };
    mocks.admin.mockReturnValue(db.admin);
    mocks.access.mockResolvedValue({ teacherId: "teacher-1", subjectName: "Nims" });
    mocks.prepare.mockImplementation(async (_key: string, input: { topic: string }) =>
      readyResponse(input.topic),
    );
    mocks.revision.mockResolvedValue({ collection_revision: "rev-1" });
    mocks.createExam.mockResolvedValue({
      attempt_id: "attempt-1",
      subject: "Nims",
      topics: [],
      questions: [
        {
          id: "e1",
          topic_key: "t1",
          topic: "Identifiers",
          marks: 5,
          question_type: "short",
          text: "Is _count valid?",
        },
        {
          id: "e2",
          topic_key: "t1",
          topic: "Identifiers",
          marks: 5,
          question_type: "short",
          text: "Why is int reserved?",
        },
      ],
      total_marks: 10,
      pass_marks: 4,
      duration_minutes: 20,
      expires_at: new Date(Date.now() + 20 * MINUTE).toISOString(),
      warning: null,
    });
  });

  afterEach(() => {
    delete process.env.CHALLENGE_POOL_INLINE_SWEEP;
  });

  describe("enqueueing", () => {
    it("queues the next two topics in syllabus order, skipping source documents", async () => {
      const result = await enqueueChallengeTopics({
        courseId: "course-1",
        subjectSlug: "teacher_nims",
        afterTopicKey: "t1",
        priority: CHALLENGE_POOL_PRIORITY.next,
      });

      expect(result.pooled).toBe(true);
      // Two ready ahead of every student, per subject.
      expect(CHALLENGE_POOL_AHEAD).toBe(2);
      expect([...result.topics.keys()]).toEqual(["t2", "t3"]);
      expect(pool().map((row) => [row.topic_key, row.status, row.priority, row.position])).toEqual([
        ["t2", "queued", CHALLENGE_POOL_PRIORITY.next, 2],
        ["t3", "queued", CHALLENGE_POOL_PRIORITY.next, 3],
      ]);
      // Everything the sweep needs to prepare one without looking anything up.
      expect(topic("t2")).toMatchObject({
        course_id: "course-1",
        teacher_id: "teacher-1",
        community_subject_id: "subject-1",
        subject_name: "Nims",
        topic_title: "Keywords",
      });

      await enqueueChallengeTopics({
        courseId: "course-1",
        subjectSlug: "teacher_nims",
        fromPosition: 0,
        count: 3,
        priority: CHALLENGE_POOL_PRIORITY.publish,
      });
      expect(
        pool()
          .map((row) => row.topic_key)
          .sort(),
      ).toEqual(["t0", "t1", "t2", "t3"]);
      expect(pool().some((row) => row.topic_key === "nims-qb")).toBe(false);
    });

    it("never downgrades a ready topic, and only ever raises priority", async () => {
      db.tables.challenge_topic_pool = [
        poolRow("t2", { status: "ready", priority: 0, content: bank, revision: "bank-t2" }),
        poolRow("t3", { status: "failed", priority: 50, attempts: 2 }),
      ];

      const result = await enqueueChallengeTopics({
        courseId: "course-1",
        subjectSlug: "teacher_nims",
        afterTopicKey: "t1",
        priority: CHALLENGE_POOL_PRIORITY.next,
      });

      expect(result.topics.get("t2")).toBe("ready");
      expect(result.pending).toEqual(["t3"]);
      expect(topic("t2")).toMatchObject({
        status: "ready",
        content: bank,
        priority: CHALLENGE_POOL_PRIORITY.next,
      });
      // Higher already; its backoff is its own business.
      expect(topic("t3")).toMatchObject({ status: "failed", priority: 50, attempts: 2 });
      // Two ahead, not three.
      expect(topic("t4")).toBeUndefined();
    });

    it("leaves a course no community owns to the per-student path", async () => {
      const result = await enqueueChallengeTopics({
        courseId: "legacy-course",
        subjectSlug: "teacher_nims",
        afterTopicKey: "t1",
      });
      expect(result).toMatchObject({ pooled: false, reason: "no-catalogue" });
      expect(pool()).toEqual([]);
    });
  });

  describe("sweeping", () => {
    it("prepares each claimed topic once, even with two sweeps at the same time", async () => {
      db.tables.challenge_topic_pool = ["t0", "t1", "t2"].map((key) => poolRow(key));
      mocks.prepare.mockImplementation(async (_key: string, input: { topic: string }) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return readyResponse(input.topic);
      });

      const [first, second] = await Promise.all([
        sweepChallengePool({ limit: 2, markStale: false }),
        sweepChallengePool({ limit: 2, markStale: false }),
      ]);

      expect(first.claimed + second.claimed).toBe(3);
      expect(mocks.prepare.mock.calls.map(([, input]) => input.topic).sort()).toEqual([
        "t0",
        "t1",
        "t2",
      ]);
      expect(mocks.prepare).toHaveBeenCalledWith("collection", { subject: "teacher_nims", topic: "t0" });
      expect(pool().every((row) => row.status === "ready")).toBe(true);

      // A third sweep finds nothing to do.
      const third = await sweepChallengePool({ limit: 6, markStale: false });
      expect(third.claimed).toBe(0);
      expect(mocks.prepare).toHaveBeenCalledTimes(3);
    });

    it("stores a ready topic's whole bank and lets go of it", async () => {
      db.tables.challenge_topic_pool = [poolRow("t1", { attempts: 3, last_error: "earlier" })];

      const summary = await sweepChallengePool({ limit: 6, markStale: false });

      expect(summary.outcomes.ready).toBe(1);
      expect(topic("t1")).toMatchObject({
        status: "ready",
        content: bank,
        revision: "bank-t1",
        collection_revision: "rev-1",
        attempts: 0,
        last_error: null,
        lease_owner: null,
        lease_expires_at: null,
      });
      expect(topic("t1").prepared_at).toBeTruthy();
      expect(
        (await readyPoolSnapshot("course-1", "teacher_nims", "t1"))?.content.past_questions,
      ).toHaveLength(12);
    });

    it("polls a topic that is still building on the next sweep, not this one", async () => {
      db.tables.challenge_topic_pool = [poolRow("t1")];
      mocks.prepare.mockResolvedValueOnce({
        ...readyResponse("t1"),
        state: "building",
        content: null,
      });

      await sweepChallengePool({ limit: 6, markStale: false });
      expect(topic("t1").status).toBe("building");
      expect(topic("t1").lease_owner).toBeTruthy();
      const lease = Date.parse(String(topic("t1").lease_expires_at));
      expect(lease - Date.now()).toBeGreaterThan(1.5 * MINUTE);
      expect(lease - Date.now()).toBeLessThanOrEqual(2 * MINUTE);

      // Still leased: an immediate sweep leaves it alone.
      await sweepChallengePool({ limit: 6, markStale: false });
      expect(mocks.prepare).toHaveBeenCalledTimes(1);

      // The lease lapses; the next sweep asks again and gets the bank.
      topic("t1").lease_expires_at = new Date(Date.now() - 1000).toISOString();
      await sweepChallengePool({ limit: 6, markStale: false });
      expect(mocks.prepare).toHaveBeenCalledTimes(2);
      expect(topic("t1").status).toBe("ready");
    });

    it("backs off a failed topic exponentially and gives up after six attempts", async () => {
      db.tables.challenge_topic_pool = [poolRow("t1")];
      mocks.prepare.mockResolvedValue({
        ...readyResponse("t1"),
        state: "failed",
        content: null,
        error: "model timed out",
      });

      await sweepChallengePool({ limit: 6, markStale: false });
      expect(topic("t1")).toMatchObject({
        status: "failed",
        attempts: 1,
        last_error: "model timed out",
        lease_owner: null,
      });
      const wait = Date.parse(String(topic("t1").next_attempt_at)) - Date.now();
      expect(wait).toBeGreaterThan(1.9 * MINUTE);
      expect(wait).toBeLessThanOrEqual(2 * MINUTE);

      // Not before its backoff is over.
      await sweepChallengePool({ limit: 6, markStale: false });
      expect(mocks.prepare).toHaveBeenCalledTimes(1);

      topic("t1").next_attempt_at = new Date(Date.now() - 1000).toISOString();
      await sweepChallengePool({ limit: 6, markStale: false });
      expect(topic("t1").attempts).toBe(2);
      const second = Date.parse(String(topic("t1").next_attempt_at)) - Date.now();
      expect(second).toBeGreaterThan(3.9 * MINUTE);

      // The sixth failure is the last.
      Object.assign(topic("t1"), {
        attempts: CHALLENGE_POOL_MAX_ATTEMPTS - 1,
        next_attempt_at: new Date(Date.now() - 1000).toISOString(),
      });
      await sweepChallengePool({ limit: 6, markStale: false });
      expect(topic("t1")).toMatchObject({
        status: "unavailable",
        attempts: CHALLENGE_POOL_MAX_ATTEMPTS,
      });
      expect(mocks.prepare).toHaveBeenCalledTimes(3);
      // …and it is not asked for again.
      await sweepChallengePool({ limit: 6, markStale: false });
      expect(mocks.prepare).toHaveBeenCalledTimes(3);
    });

    it("caps the backoff at an hour", async () => {
      db.tables.challenge_topic_pool = [poolRow("t1", { attempts: 4 })];
      mocks.prepare.mockRejectedValue(new TeacherApiError("boom", 500));
      await sweepChallengePool({ limit: 6, markStale: false });
      expect(topic("t1").attempts).toBe(5);
      const wait = Date.parse(String(topic("t1").next_attempt_at)) - Date.now();
      expect(wait).toBeGreaterThan(31 * MINUTE);
      expect(wait).toBeLessThanOrEqual(32 * MINUTE);
    });

    it("leaves a topic the material cannot produce alone", async () => {
      db.tables.challenge_topic_pool = [poolRow("t1")];
      mocks.prepare.mockResolvedValue({
        ...readyResponse("t1"),
        state: "unavailable",
        content: null,
        error: "no indexed material for Identifiers",
      });

      const summary = await sweepChallengePool({ limit: 6, markStale: false });
      expect(summary.outcomes.unavailable).toBe(1);
      expect(topic("t1")).toMatchObject({
        status: "unavailable",
        last_error: "no indexed material for Identifiers",
        collection_revision: "rev-1",
      });
      await sweepChallengePool({ limit: 6, markStale: false });
      expect(mocks.prepare).toHaveBeenCalledTimes(1);
    });

    it("does not hold an older course API against the topic", async () => {
      db.tables.challenge_topic_pool = [poolRow("t1")];
      mocks.prepare.mockRejectedValue(
        new TeacherApiError("Not Found", 404, { detail: "Not Found" }),
      );

      const summary = await sweepChallengePool({ limit: 6, markStale: false });
      expect(summary.outcomes.parked).toBe(1);
      expect(topic("t1")).toMatchObject({ status: "queued", attempts: 0, lease_owner: null });
      expect(Date.parse(String(topic("t1").next_attempt_at)) - Date.now()).toBeGreaterThan(
        14 * MINUTE,
      );
    });

    it("refreshes topics whose material changed, and topics nearing the reading's thirty days", async () => {
      const old = new Date(Date.now() - 26 * 24 * 60 * MINUTE).toISOString();
      const recent = new Date(Date.now() - 60 * MINUTE).toISOString();
      db.tables.challenge_topic_pool = [
        poolRow("t0", { status: "ready", collection_revision: "rev-1", prepared_at: recent }),
        poolRow("t1", { status: "ready", collection_revision: "rev-1", prepared_at: old }),
        poolRow("t2", { status: "unavailable", collection_revision: "rev-1", attempts: 6 }),
        // Given up on after six failures, with no revision recorded: stamped,
        // not retried on every check.
        poolRow("t4", { status: "unavailable", attempts: 6 }),
        {
          ...poolRow("t3", { status: "ready", collection_revision: "rev-9", prepared_at: recent }),
          subject_slug: "teacher_other",
          subject_name: "Other",
        },
      ];
      mocks.revision.mockImplementation(async (_key: string, subject: string) => ({
        // Asked by slug, as every upstream call is (see tests/lib/subject-rename.test.ts).
        collection_revision: subject === "teacher_nims" ? "rev-2" : "rev-9",
      }));

      const summary = await sweepChallengePool({ limit: 0 });

      // One revision call per subject, however many topics it has.
      expect(mocks.revision).toHaveBeenCalledTimes(2);
      expect(summary.stale).toMatchObject({
        byAge: 1,
        byRevision: 1,
        requeued: 1,
        subjectsChecked: 2,
      });
      expect(topic("t0").status).toBe("stale");
      expect(topic("t1").status).toBe("stale");
      expect(topic("t2")).toMatchObject({ status: "queued", attempts: 0 });
      expect(topic("t4")).toMatchObject({ status: "unavailable", collection_revision: "rev-2" });
      expect(topic("t3").status).toBe("ready");
      expect(topic("t3").checked_at).toBeTruthy();

      // Confirmed moments ago: not asked about again on the next sweep.
      await sweepChallengePool({ limit: 0 });
      expect(mocks.revision).toHaveBeenCalledTimes(2);

      // A stale topic is prepared again — and served until then by nobody.
      expect(await readyPoolSnapshot("course-1", "teacher_nims", "t0")).toBeNull();
      await sweepChallengePool({ limit: 6, markStale: false });
      expect(topic("t0").status).toBe("ready");
    });
  });

  describe("students", () => {
    beforeEach(() => {
      db.tables.challenge_topic_pool = [
        poolRow("t1", {
          status: "ready",
          content: bank,
          revision: "bank-t1",
          collection_revision: "rev-1",
          prepared_at: new Date().toISOString(),
        }),
      ];
    });

    it("cut a started challenge from the pool: no past-questions, solved or reading call, one paper", async () => {
      db.tables.student_challenges = [studentRow("c1", "t1")];

      const detail = await startStudentChallenge("member", "c1");

      expect(detail?.status).toBe("started");
      const content = detail?.content;
      expect(content?.pastQuestions).toHaveLength(10);
      expect(content?.solvedExamples).toHaveLength(10);
      // Exactly the listed questions are the worked ones.
      expect(content?.solvedExamples.map((example) => example.question)).toEqual(
        content?.pastQuestions?.map((question) => question.question),
      );
      expect(content?.lesson.content).toEqual([
        "Identifiers name things.",
        "They follow the language's naming rules.",
      ]);
      expect(content?.pooledFrom).toMatchObject({ revision: "bank-t1" });

      await vi.waitFor(() =>
        expect((student("c1").content as { contentStatus?: string }).contentStatus).toBe("ready"),
      );
      expect(mocks.pastQuestions).not.toHaveBeenCalled();
      expect(mocks.solved).not.toHaveBeenCalled();
      expect(mocks.reading).not.toHaveBeenCalled();
      expect(mocks.practiceTopics).not.toHaveBeenCalled();
      expect(mocks.createExam).toHaveBeenCalledTimes(1);
      expect(mocks.createExam).toHaveBeenCalledWith("collection", {
        subject: "Nims",
        topics: ["t1"],
        questions: 2,
        duration_minutes: 20,
        pass_percent: 40,
        exclude_questions: content?.solvedExamples.map((example) => example.question),
      });
      expect(student("c1").external_paper_id).toBe("attempt-1");
    });

    it("show one student the same ten every time, and a deeper bank differently to others", async () => {
      db.tables.student_challenges = [
        studentRow("c1", "t1"),
        ...["s2", "s3", "s4", "s5"].map((user) => studentRow(`c-${user}`, "t1", { user_id: user })),
      ];
      const listed = async (user: string, id: string) =>
        (await startStudentChallenge(user, id))?.content?.pastQuestions?.map(
          (question) => question.id,
        );

      const first = await listed("member", "c1");
      expect(first).toHaveLength(10);
      await vi.waitFor(() =>
        expect((student("c1").content as { contentStatus?: string }).contentStatus).toBe("ready"),
      );
      // Built again from the pool — a restart — it is the same ten.
      const rebuilt = await restartStudentChallenge("member", "c1");
      expect(rebuilt?.content?.pastQuestions?.map((question) => question.id)).toEqual(first);
      // A window of the bank, in the bank's own order.
      const order = bankQuestions.map((question) => question.id);
      expect(first).toEqual(order.filter((id) => first?.includes(id)));

      const others = await Promise.all(
        ["s2", "s3", "s4", "s5"].map((user) => listed(user, `c-${user}`)),
      );
      expect(others.some((ids) => JSON.stringify(ids) !== JSON.stringify(first))).toBe(true);
    });

    it("finish a challenge built per student from the pool once its topic is ready there", async () => {
      // Warmed the old way, before the topic was pooled: questions, no answers,
      // no reading.
      db.tables.student_challenges = [
        studentRow("c1", "t1", {
          content: {
            provider: "collection-challenge-v1",
            contentStatus: "pending",
            contentPendingSince: new Date().toISOString(),
            topicKeys: ["t1"],
            pastQuestions: bankQuestions.slice(0, 2).map((question) => ({
              id: question.id,
              question: question.text,
              topic: "Identifiers",
              topicKey: "t1",
              marks: 5,
              year: "2079",
            })),
            lesson: { title: "", content: [], focus: "" },
            solvedExamples: [],
            examQuestions: [],
            warning: null,
          },
        }),
      ];

      await startStudentChallenge("member", "c1");

      await vi.waitFor(() =>
        expect((student("c1").content as { contentStatus?: string }).contentStatus).toBe("ready"),
      );
      const content = student("c1").content as {
        solvedExamples: Array<{ question: string }>;
        lesson: { content: string[] };
      };
      expect(content.solvedExamples.map((example) => example.question)).toEqual(
        bankQuestions.slice(0, 2).map((question) => question.text),
      );
      expect(content.lesson.content.length).toBeGreaterThan(0);
      expect(mocks.solved).not.toHaveBeenCalled();
      expect(mocks.reading).not.toHaveBeenCalled();
      expect(mocks.createExam).toHaveBeenCalledTimes(1);
      expect(mocks.createExam.mock.calls[0][1].exclude_questions).toEqual(
        bankQuestions.slice(0, 2).map((question) => question.text),
      );
    });

    it("list the questions that have worked answers first, joined by id when the text differs", async () => {
      const deep = Array.from({ length: 14 }, (_, index) => ({
        id: `dq${index}`,
        text: `Deep question ${index}?`,
        year: "2080",
        marks: 5,
      }));
      Object.assign(topic("t1"), {
        content: {
          ...bank,
          past_questions: deep,
          // Answers for eight of fourteen; one filed under different wording.
          solved: deep.slice(0, 8).map((question, index) => ({
            id: question.id,
            text: index === 3 ? "Deep question three, restated?" : question.text,
            solution: `Worked: ${question.id}`,
            topic: "Identifiers",
            topic_key: "t1",
            source: "question_bank",
          })),
        },
      });
      db.tables.student_challenges = [studentRow("c1", "t1")];

      const content = (await startStudentChallenge("member", "c1"))?.content;

      const listedIds = content?.pastQuestions?.map((question) => question.id) ?? [];
      expect(listedIds).toHaveLength(10);
      // Every worked question is on the list; two unworked ones make up ten.
      expect(deep.slice(0, 8).every((question) => listedIds.includes(question.id))).toBe(true);
      expect(content?.solvedExamples).toHaveLength(8);
      expect(content?.solvedExamples.map((example) => example.question)).toContain(
        "Deep question 3?",
      );
      await vi.waitFor(() => expect(mocks.createExam).toHaveBeenCalledTimes(1));
      expect(mocks.solved).not.toHaveBeenCalled();
    });

    it("fill the hub's cards from the pool without starting them, and queue the rest", async () => {
      db.tables.student_challenges = [
        studentRow("c1", "t1"),
        studentRow("c2", "t4", { position: 1 }),
      ];
      const cards = (db.tables.student_challenges as Row[]).map((row) => ({
        id: row.id,
        status: "assigned",
        courseId: row.course_id,
        subjectSlug: row.subject_slug,
        subjectName: row.subject_name,
        topicKey: row.topic_key,
        topicTitle: row.topic_title,
        pastQuestionCount: null,
      }));

      scheduleChallengeWarmups("member", cards as never);

      await vi.waitFor(() =>
        expect((student("c1").content as { pooledFrom?: unknown })?.pooledFrom).toBeTruthy(),
      );
      await vi.waitFor(() =>
        expect(topic("t4")).toMatchObject({
          status: "queued",
          priority: CHALLENGE_POOL_PRIORITY.waiting,
        }),
      );
      expect(student("c1").status).toBe("assigned");
      expect(student("c1").started_at).toBeUndefined();
      expect(student("c2").content).toBeUndefined();
      // Nothing per student: no warm-up, no preparation, no paper.
      expect(mocks.pastQuestions).not.toHaveBeenCalled();
      expect(mocks.solved).not.toHaveBeenCalled();
      expect(mocks.reading).not.toHaveBeenCalled();
      expect(mocks.createExam).not.toHaveBeenCalled();
    });

    it("start preparing a queued card at once, behind the hub", async () => {
      process.env.CHALLENGE_POOL_INLINE_SWEEP = "1";
      db.tables.student_challenges = [studentRow("c2", "t4")];

      scheduleChallengeWarmups("member", [
        {
          id: "c2",
          status: "assigned",
          courseId: "course-1",
          subjectSlug: "teacher_nims",
          subjectName: "Nims",
          topicKey: "t4",
          topicTitle: "Expressions",
          pastQuestionCount: null,
        },
      ] as never);

      await vi.waitFor(() => expect(topic("t4")?.status).toBe("ready"));
      expect(mocks.prepare).toHaveBeenCalledWith("collection", { subject: "teacher_nims", topic: "t4" });
      expect(mocks.pastQuestions).not.toHaveBeenCalled();
    });

    it("queue the two topics after the one a student starts", async () => {
      db.tables.student_challenges = [studentRow("c1", "t1")];

      await startStudentChallenge("member", "c1");

      await vi.waitFor(() =>
        expect(
          pool()
            .map((row) => row.topic_key)
            .sort(),
        ).toEqual(["t1", "t2", "t3"]),
      );
      expect(["t2", "t3"].map((key) => topic(key).priority)).toEqual([
        CHALLENGE_POOL_PRIORITY.next,
        CHALLENGE_POOL_PRIORITY.next,
      ]);
    });

    it("queue the two topics after the one a student finishes", async () => {
      db.tables.student_challenges = [studentRow("c3", "t3", { status: "started" })];
      db.rpcs.record_student_challenge_grade = () => [
        { ...student("c3"), status: "completed", completed_at: new Date().toISOString() },
      ];

      await recordStudentChallengeGrade({
        userId: "member",
        challengeId: "c3",
        attemptId: "attempt-1",
        score: 8,
        totalMarks: 10,
        passed: true,
      });

      await vi.waitFor(() =>
        expect(
          pool()
            .map((row) => row.topic_key)
            .sort(),
        ).toEqual(["t1", "t4", "t5"]),
      );
    });
  });

  describe("before the migration has run", () => {
    beforeEach(() => {
      db.missing.add("challenge_topic_pool");
      delete db.rpcs.claim_challenge_topic_pool;
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    it("does nothing, says so once, and leaves students to the per-student path", async () => {
      await expect(
        enqueueChallengeTopics({
          courseId: "course-1",
          subjectSlug: "teacher_nims",
          afterTopicKey: "t1",
        }),
      ).resolves.toMatchObject({ pooled: false, reason: "missing-table" });
      await expect(sweepChallengePool({ limit: 6 })).resolves.toMatchObject({
        available: false,
        claimed: 0,
      });
      await expect(readyPoolSnapshot("course-1", "teacher_nims", "t1")).resolves.toBeNull();
      expect(mocks.prepare).not.toHaveBeenCalled();
      expect(mocks.revision).not.toHaveBeenCalled();
      expect(
        (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter(([line]) =>
          String(line).includes("challenge_topic_pool is missing"),
        ),
      ).toHaveLength(1);

      // The hub warms per student exactly as before.
      mocks.pastQuestions.mockResolvedValue({
        can_start: true,
        topics: [{ topic_key: "t1", title: "Identifiers" }],
        questions: [],
        grounded: false,
        blockers: [],
        warnings: [],
      });
      mocks.solved.mockResolvedValue({ questions: [], grounded: false, warnings: [] });
      mocks.reading.mockResolvedValue({
        reading: {
          headline: "Identifiers",
          content: "Identifiers name things.",
          focus: "",
          sources: [],
        },
        warnings: [],
      });
      resetChallengePoolState();
      db.tables.student_challenges = [studentRow("c1", "t1")];
      scheduleChallengeWarmups("member", [
        {
          id: "c1",
          status: "assigned",
          courseId: "course-1",
          subjectSlug: "teacher_nims",
          subjectName: "Nims",
          topicKey: "t1",
          topicTitle: "Identifiers",
        },
      ] as never);
      await vi.waitFor(() => expect(mocks.pastQuestions).toHaveBeenCalledTimes(1));
      await vi.waitFor(() =>
        expect((student("c1").content as { provider?: string })?.provider).toBe(
          "collection-challenge-v1",
        ),
      );
    });
  });
});
