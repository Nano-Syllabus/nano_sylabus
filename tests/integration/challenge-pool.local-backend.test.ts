import { beforeAll, describe, expect, it, vi } from "vitest";
import { communityLearningFixture } from "../helpers/learning-database";

/**
 * The challenge pool, end to end against a LOCAL api-service.
 *
 * Not part of `npm test` (tests/integration is run explicitly). Needs:
 *   TENANT_API_BASE_URL=http://127.0.0.1:8000  TENANT_API_TOKEN=<anything>
 *   DEV_COLLECTION_KEY=<a collection key the local backend accepts>
 *   POOL_ITEST_SUBJECT / POOL_ITEST_TOPIC  (a topic that exists in that collection)
 *
 * Supabase is the in-memory fixture — the only real Supabase is production — so
 * this checks the part unit tests cannot: the frontend's pool code and the real
 * prepare / revision / exam routes agree on the contract.
 */

const SUBJECT = process.env.POOL_ITEST_SUBJECT ?? "Engineering Physics";
const TOPIC = process.env.POOL_ITEST_TOPIC ?? "fraunhoffer_s_diffraction_at_single_slit";
const live = Boolean(process.env.DEV_COLLECTION_KEY && process.env.TENANT_API_BASE_URL);

const mocks = vi.hoisted(() => ({ admin: vi.fn(), access: vi.fn() }));
const spies = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof vi.fn>>);
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/lib/student-courses", () => ({
  getStudentCourseSubjectAccessForCourse: mocks.access,
  getStudentCourseSubjectAccess: mocks.access,
  getStudentCourseSubjectAccessCached: mocks.access,
}));
// Real HTTP to the local backend, counted.
vi.mock("@/lib/teacher-app/client", async (original) => {
  const real = await original<typeof import("@/lib/teacher-app/client")>();
  spies.prepare = vi.fn(real.prepareTeacherChallengeTopic);
  spies.revision = vi.fn(real.getTeacherChallengeRevision);
  spies.pastQuestions = vi.fn(real.getTeacherChallengePastQuestions);
  spies.solved = vi.fn(real.getTeacherChallengeSolvedQuestions);
  spies.reading = vi.fn(real.getTeacherChallengeReading);
  spies.exam = vi.fn(real.createTeacherChallengeExam);
  return {
    ...real,
    prepareTeacherChallengeTopic: spies.prepare,
    getTeacherChallengeRevision: spies.revision,
    getTeacherChallengePastQuestions: spies.pastQuestions,
    getTeacherChallengeSolvedQuestions: spies.solved,
    getTeacherChallengeReading: spies.reading,
    createTeacherChallengeExam: spies.exam,
  };
});

import { resetChallengePoolState, sweepChallengePool } from "@/lib/data/challenge-pool";
import { nepaliChallengeDate, startStudentChallenge } from "@/lib/data/student-challenges";

type Row = Record<string, unknown>;

describe.skipIf(!live)("challenge pool against the local backend", () => {
  const db = communityLearningFixture();
  const pool = () => db.tables.challenge_topic_pool as Row[];

  beforeAll(() => {
    resetChallengePoolState();
    process.env.CHALLENGE_POOL_INLINE_SWEEP = "0";
    mocks.admin.mockReturnValue(db.admin);
    mocks.access.mockResolvedValue({ teacherId: "teacher-1", subjectName: SUBJECT });
    db.tables.community_subject_topics = [
      {
        id: "topic-0",
        community_subject_id: "subject-1",
        topic_key: TOPIC,
        title: "Fraunhofer diffraction at a single slit",
        blurb: "",
        unit_number: "1",
        position: 0,
        source: "syllabus",
      },
    ];
    db.tables.challenge_topic_pool = [
      {
        id: "pool-1",
        course_id: "course-1",
        teacher_id: "teacher-1",
        community_subject_id: "subject-1",
        subject_slug: "engineering-physics",
        subject_name: SUBJECT,
        topic_key: TOPIC,
        topic_title: "Fraunhofer diffraction at a single slit",
        position: 0,
        status: "queued",
        priority: 30,
        attempts: 0,
      },
    ];
    db.rpcs.claim_challenge_topic_pool = (args) => {
      const { p_owner, p_limit, p_lease_seconds } = args as Record<string, never>;
      const now = Date.now();
      const due = (value: unknown) => !value || Date.parse(String(value)) <= now;
      return pool()
        .filter(
          (row) =>
            (["queued", "stale", "failed"].includes(String(row.status)) &&
              due(row.next_attempt_at)) ||
            (row.status === "building" && due(row.lease_expires_at)),
        )
        .slice(0, p_limit)
        .map((row) => {
          const prior = row.status;
          Object.assign(row, {
            status: "building",
            lease_owner: p_owner,
            lease_expires_at: new Date(now + Number(p_lease_seconds) * 1000).toISOString(),
          });
          return { ...row, prior_status: prior };
        });
    };
  });

  it("prepares the topic through the sweep, and its revision does not read as stale", async () => {
    for (let attempt = 0; attempt < 20 && pool()[0].status !== "ready"; attempt += 1) {
      // A `building` answer leases the row for two minutes; release it so the
      // next sweep polls now instead of waiting out the lease.
      if (pool()[0].status === "building") pool()[0].lease_expires_at = null;
      await sweepChallengePool({ limit: 2, markStale: false });
      if (pool()[0].status !== "ready") await new Promise((r) => setTimeout(r, 5000));
    }
    const row = pool()[0];
    expect(row.status, String(row.last_error ?? "")).toBe("ready");
    const content = row.content as {
      past_questions: unknown[];
      solved: Array<{ solution: string }>;
      reading: unknown;
    };
    expect(content.past_questions.length).toBeGreaterThan(0);
    expect(content.solved.length).toBeGreaterThan(0);
    expect(content.reading).toBeTruthy();
    expect(row.collection_revision).toBeTruthy();

    // The stale pass: the revision route must agree with the prepare response.
    const before = { status: row.status, revision: row.collection_revision };
    row.checked_at = null;
    await sweepChallengePool({ limit: 0 });
    expect(spies.revision).toHaveBeenCalled();
    expect({ status: row.status, revision: row.collection_revision }).toEqual(before);
  }, 240_000);

  it("cuts a student's challenge from it: no past-questions, solved or reading call, one real paper", async () => {
    for (const spy of Object.values(spies)) spy.mockClear();
    db.tables.student_challenges = [
      {
        id: "c1",
        user_id: "member",
        course_id: "course-1",
        challenge_date: nepaliChallengeDate(),
        position: 0,
        subject_slug: "engineering-physics",
        subject_name: SUBJECT,
        topic_key: TOPIC,
        topic_title: "Fraunhofer diffraction at a single slit",
        status: "assigned",
      },
    ];

    const detail = await startStudentChallenge("member", "c1");
    expect(detail?.status).toBe("started");
    const content = detail?.content;
    expect(content?.pastQuestions?.length).toBeGreaterThan(0);
    expect(content?.solvedExamples.map((example) => example.question)).toEqual(
      content?.pastQuestions?.map((question) => question.question),
    );
    expect(content?.lesson.content.length).toBeGreaterThan(0);
    expect(content?.pooledFrom).toBeTruthy();

    await vi.waitFor(
      () => {
        const row = (db.tables.student_challenges as Row[])[0];
        expect((row.content as { contentStatus?: string }).contentStatus).toBe("ready");
      },
      { timeout: 120_000, interval: 1000 },
    );
    expect(spies.pastQuestions).not.toHaveBeenCalled();
    expect(spies.solved).not.toHaveBeenCalled();
    expect(spies.reading).not.toHaveBeenCalled();
    expect(spies.exam).toHaveBeenCalledTimes(1);

    // Any figure in a worked answer is served by the backend.
    const figures = (content?.solvedExamples ?? [])
      .flatMap((example) => [...example.solution.matchAll(/\]\((\/api\/figure\/[0-9a-f]+\.png)\)/g)])
      .map((match) => match[1]);
    for (const url of figures) {
      const response = await fetch(new URL(url, process.env.TENANT_API_BASE_URL));
      expect(response.status, url).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
    }
    console.log(
      `[itest] ${content?.pastQuestions?.length} past questions, ${content?.solvedExamples.length} worked, ${figures.length} figure(s) served`,
    );
  }, 180_000);
});
