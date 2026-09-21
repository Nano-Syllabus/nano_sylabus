import { beforeEach, describe, expect, it, vi } from "vitest";
import { communityLearningFixture } from "../helpers/learning-database";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  access: vi.fn(),
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
  getTeacherChallengePastQuestions: mocks.pastQuestions,
  getTeacherChallengeReading: mocks.reading,
  getTeacherChallengeSolvedQuestions: mocks.solved,
  getTeacherPracticeTopics: mocks.practiceTopics,
  createTeacherChallengeExam: mocks.createExam,
}));

import {
  CHALLENGE_SOLVED_QUESTIONS,
  getStudentChallengeContent,
  nepaliChallengeDate,
  nextOpenChallengeId,
  prepareStudentChallenge,
  scheduleChallengeWarmups,
  startStudentChallenge,
} from "@/lib/data/student-challenges";
import { invalidateMemo } from "@/lib/http/memo";

/**
 * The next challenge is ready before the student reaches it.
 *
 * A challenge's past questions, worked answers and reading depend on the course
 * and the topic, never the student, and the course API pools what it writes. So
 * the only student who ever waits on the model for a topic is the first — and
 * preparing the next challenge while they are on this one makes that wait
 * happen before they get there.
 */

type Row = Record<string, unknown>;
type Content = {
  provider?: string;
  lesson?: { content?: unknown[] | string };
  contentStatus?: string;
  contentError?: string | null;
};

const LISTED = ["Define an identifier.", "State the rules for naming identifiers."];

function challenge(id: string, position: number, overrides: Row = {}): Row {
  return {
    id,
    user_id: "member",
    course_id: "course-1",
    challenge_date: nepaliChallengeDate(),
    position,
    subject_slug: "teacher_nims",
    subject_name: "Nims",
    topic_key: `provider-${id}`,
    topic_title: `Topic ${id}`,
    status: "assigned",
    ...overrides,
  };
}

describe("preparing a challenge ahead of the student", () => {
  let db: ReturnType<typeof communityLearningFixture>;
  const byId = (id: string) => db.tables.student_challenges.find((row: Row) => row.id === id) as Row;
  const contentOf = (id: string) => byId(id).content as Content;

  beforeEach(() => {
    vi.clearAllMocks();
    invalidateMemo("challenge:collection-sk");
    db = communityLearningFixture();
    db.tables.student_challenges = [challenge("c19", 0), challenge("c20", 1)];
    mocks.admin.mockReturnValue(db.admin);
    mocks.access.mockResolvedValue({ teacherId: "teacher-1", subjectName: "Nims" });
    mocks.pastQuestions.mockImplementation(async (_key: string, input: { topics: string[] }) => ({
      can_start: true,
      topics: [{ topic_key: input.topics[0], title: "Identifiers" }],
      questions: LISTED.map((text, index) => ({ id: `q${index}`, text, year: "2079" })),
      grounded: true,
      blockers: [],
      warnings: [],
    }));
    mocks.reading.mockResolvedValue({
      reading: { headline: "Identifiers", content: "Identifiers name things.", focus: "Identifiers", sources: [] },
      warnings: [],
    });
    mocks.solved.mockResolvedValue({
      questions: LISTED.map((text) => ({ text, solution: `Worked: ${text}`, source: "question_bank" })),
      grounded: true,
      warnings: [],
    });
    mocks.practiceTopics.mockResolvedValue({ question_bank_questions: 4, topics: [] });
    mocks.createExam.mockResolvedValue({
      attempt_id: "attempt-1",
      subject: "Nims",
      topics: [],
      questions: [
        { id: "e1", topic_key: "provider-c19", topic: "Identifiers", marks: 10, question_type: "short", text: "Why are keywords not identifiers?" },
        { id: "e2", topic_key: "provider-c19", topic: "Identifiers", marks: 10, question_type: "short", text: "Is _count a valid identifier?" },
      ],
      total_marks: 20,
      pass_marks: 8,
      duration_minutes: 20,
      expires_at: new Date(Date.now() + 20 * 60_000).toISOString(),
      warning: null,
    });
  });

  it("puts the worked answers in the pool and the reading on the row, without starting it", async () => {
    await expect(prepareStudentChallenge("member", "c20")).resolves.toBe("prepared");

    // Exactly the request the completion makes after Start — the listed past
    // questions — so what it asks for then is what the pool now holds.
    expect(mocks.solved).toHaveBeenCalledWith(expect.any(String), {
      subject: "Nims",
      topics: ["provider-c20"],
      limit: CHALLENGE_SOLVED_QUESTIONS,
      questions: LISTED,
    });
    expect(mocks.reading).toHaveBeenCalledWith(expect.any(String), {
      subject: "Nims",
      topics: ["provider-c20"],
    });
    expect(contentOf("c20").lesson?.content).toBeTruthy();
    expect(contentOf("c20").lesson?.content?.length).toBeGreaterThan(0);
    // Still the student's to start: no clock, no paper.
    expect(byId("c20").status).toBe("assigned");
    expect(byId("c20").started_at).toBeUndefined();
    expect(mocks.createExam).not.toHaveBeenCalled();
  });

  it("makes Start on a prepared challenge ask for nothing but the pool and the paper", async () => {
    await prepareStudentChallenge("member", "c20");
    mocks.pastQuestions.mockClear();
    mocks.reading.mockClear();
    mocks.solved.mockClear();

    const detail = await startStudentChallenge("member", "c20");

    // Step one is complete the moment it opens — concepts card included.
    expect(detail?.status).toBe("started");
    expect(detail?.content?.lesson.content?.length).toBeGreaterThan(0);
    expect(mocks.pastQuestions).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(contentOf("c20").contentStatus).toBe("ready"));
    // The worked answers are asked for again — and served from the pool — but
    // the reading, already on the row, is not written a second time. (Calls for
    // 19 are 20's completion preparing the next open challenge in the subject.)
    const forC20 = (calls: unknown[][]) =>
      calls.filter(([, input]) => (input as { topics: string[] }).topics[0] === "provider-c20");
    expect(forC20(mocks.solved.mock.calls)).toHaveLength(1);
    expect(forC20(mocks.reading.mock.calls)).toHaveLength(0);
    expect(mocks.createExam).toHaveBeenCalledTimes(1);
  });

  it("prepares a row once, and never one the student has opened", async () => {
    await prepareStudentChallenge("member", "c20");
    mocks.solved.mockClear();
    mocks.reading.mockClear();
    await expect(prepareStudentChallenge("member", "c20")).resolves.toBe("skipped");
    expect(mocks.solved).not.toHaveBeenCalled();
    expect(mocks.reading).not.toHaveBeenCalled();

    byId("c19").status = "started";
    await expect(prepareStudentChallenge("member", "c19")).resolves.toBe("skipped");
    expect(mocks.solved).not.toHaveBeenCalled();
  });

  it("fails silently: nothing parked on a row the student never asked to have built", async () => {
    mocks.reading.mockRejectedValue(new Error("upstream down"));

    await expect(prepareStudentChallenge("member", "c20")).resolves.toBe("failed");
    expect(byId("c20").status).toBe("assigned");
    expect(contentOf("c20").contentError ?? null).toBeNull();
    // The warmed lesson stays — it is real — and Start writes the reading as before.
    expect(contentOf("c20").provider).toBe("collection-challenge-v1");
  });

  it("prepares challenge 20 once challenge 19's own content is ready", async () => {
    await startStudentChallenge("member", "c19");

    // 19 first: its paper and its reading are what the student is waiting on.
    await vi.waitFor(() => expect(contentOf("c19").contentStatus).toBe("ready"));
    await vi.waitFor(() => expect(contentOf("c20").lesson?.content?.length).toBeGreaterThan(0));
    expect(mocks.reading.mock.calls.map(([, input]) => input.topics[0])).toEqual([
      "provider-c19",
      "provider-c20",
    ]);
    expect(byId("c20").status).toBe("assigned");
    // Only 19's paper exists.
    expect(mocks.createExam).toHaveBeenCalledTimes(1);
  });

  it("waits for challenge 19's reading — the concepts card the student is looking at — before touching 20", async () => {
    let finishReading: (value: unknown) => void = () => {};
    const reading = await mocks.reading();
    mocks.reading.mockImplementationOnce(
      () => new Promise((resolve) => (finishReading = () => resolve(reading))),
    );
    const askedFor = () => mocks.pastQuestions.mock.calls.map(([, input]) => input.topics[0]);

    await startStudentChallenge("member", "c19");
    await vi.waitFor(() => expect(contentOf("c19").contentStatus).toBe("ready"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(askedFor()).not.toContain("provider-c20");

    finishReading(reading);
    await vi.waitFor(() => expect(askedFor()).toContain("provider-c20"));
    await vi.waitFor(() => expect(contentOf("c20").lesson?.content?.length).toBeGreaterThan(0));
  });

  it("prepares the hub's first open card completely, and only warms the rest", async () => {
    db.tables.student_challenges = [
      challenge("a", 0),
      challenge("b", 1, { subject_slug: "teacher_other", subject_name: "Other" }),
    ];
    scheduleChallengeWarmups(
      "member",
      db.tables.student_challenges.map((row: Row) => ({
        id: row.id,
        status: "assigned",
        courseId: row.course_id,
        subjectSlug: row.subject_slug,
      })) as never,
    );

    await vi.waitFor(() => expect(contentOf("a").lesson?.content?.length).toBeGreaterThan(0));
    await vi.waitFor(() => expect(contentOf("b")?.provider).toBe("collection-challenge-v1"));
    expect(mocks.reading.mock.calls.map(([, input]) => input.topics[0])).toEqual(["provider-a"]);
    expect(contentOf("b").lesson?.content?.length ?? 0).toBe(0);
  });
});

describe("which challenge comes next", () => {
  let db: ReturnType<typeof communityLearningFixture>;

  beforeEach(() => {
    db = communityLearningFixture();
    mocks.admin.mockReturnValue(db.admin);
  });

  it("is the next open one in the same subject, else the next on today's list", async () => {
    const other = { subject_slug: "teacher_other" };
    db.tables.student_challenges = [
      challenge("earlier-same", 0),
      challenge("current", 1, { status: "started" }),
      challenge("later-other", 2, other),
      challenge("done-same", 3, { status: "completed" }),
      challenge("later-same", 4),
    ];
    const current = db.tables.student_challenges[1] as Row;
    await expect(nextOpenChallengeId("member", current)).resolves.toBe("later-same");

    db.tables.student_challenges = db.tables.student_challenges.filter((row: Row) => row.id !== "later-same");
    // No later one in the subject: an earlier one still open in it comes first.
    await expect(nextOpenChallengeId("member", current)).resolves.toBe("earlier-same");

    db.tables.student_challenges = db.tables.student_challenges.filter((row: Row) => row.id !== "earlier-same");
    await expect(nextOpenChallengeId("member", current)).resolves.toBe("later-other");

    db.tables.student_challenges = db.tables.student_challenges.filter((row: Row) => row.id !== "later-other");
    await expect(nextOpenChallengeId("member", current)).resolves.toBeNull();
  });
});

/**
 * Every challenge shows its Concepts card.
 *
 * The reading is written after the challenge is `ready`, so a pass that died
 * after that — or a row older than the reading — has none, and a ready row is
 * never rebuilt on a reopen. Opening or polling one asks for it again.
 */
describe("a challenge with no reading", () => {
  let db: ReturnType<typeof communityLearningFixture>;
  const row = () => db.tables.student_challenges[0] as Row;
  const readyWithoutReading = (overrides: Row = {}): Row =>
    challenge(`bare-${Math.random().toString(36).slice(2)}`, 0, {
      status: "started",
      content: {
        provider: "collection-challenge-v1",
        contentStatus: "ready",
        topicKeys: ["provider-bare"],
        lesson: { title: "Identifiers", content: [], focus: "" },
        pastQuestions: [],
      },
      ...overrides,
    });

  beforeEach(() => {
    vi.clearAllMocks();
    invalidateMemo("challenge:collection-sk");
    db = communityLearningFixture();
    db.tables.student_challenges = [readyWithoutReading()];
    mocks.admin.mockReturnValue(db.admin);
    mocks.access.mockResolvedValue({ teacherId: "teacher-1", subjectName: "Nims" });
    mocks.reading.mockResolvedValue({
      reading: { headline: "Identifiers", content: "Identifiers name things.", focus: "Identifiers", sources: [] },
      warnings: [],
    });
  });

  it("gets one when the screen asks for the row, and only once while it is written", async () => {
    const id = String(row().id);
    await getStudentChallengeContent("member", id);
    await getStudentChallengeContent("member", id);
    await vi.waitFor(() => expect((row().content as Content).lesson?.content?.length).toBeGreaterThan(0));
    expect(mocks.reading).toHaveBeenCalledTimes(1);
    expect(mocks.reading).toHaveBeenCalledWith(expect.any(String), { subject: "Nims", topics: ["provider-bare"] });
  });

  it("records why, when the material cannot produce one — and a later reading clears it", async () => {
    mocks.reading.mockRejectedValueOnce(new Error("no indexed teaching material for Identifiers"));
    const id = String(row().id);
    await getStudentChallengeContent("member", id);
    await vi.waitFor(() =>
      expect((row().content as { readingError?: string }).readingError).toBe(
        "no indexed teaching material for Identifiers",
      ),
    );
    // A new challenge id is outside the retry window; the same fix on this one
    // arrives on a later open. Simulate the material being indexed since.
    db.tables.student_challenges = [{ ...row(), id: "bare-retry" }];
    await getStudentChallengeContent("member", "bare-retry");
    await vi.waitFor(() => expect((row().content as Content).lesson?.content?.length).toBeGreaterThan(0));
    expect((row().content as { readingError?: string | null }).readingError).toBeNull();
  });

  it("does not ask again on every poll after one failed", async () => {
    mocks.reading.mockRejectedValue(new Error("no indexed teaching material for Identifiers"));
    const id = String(row().id);
    await getStudentChallengeContent("member", id);
    await vi.waitFor(() => expect((row().content as { readingError?: string }).readingError).toBeTruthy());
    // The screen keeps polling; the reading is not asked for again inside the window.
    await getStudentChallengeContent("member", id);
    await getStudentChallengeContent("member", id);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.reading).toHaveBeenCalledTimes(1);
  });

  it("leaves a challenge whose build is still running to that build", async () => {
    // Building right now — not a stalled build, which would be re-kicked (and
    // that build writes the reading itself).
    Object.assign(row().content as Content, {
      contentStatus: "pending",
      contentPendingSince: new Date().toISOString(),
    });
    await getStudentChallengeContent("member", String(row().id));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.reading).not.toHaveBeenCalled();
  });

  it("gets one for a passed challenge reopened for review", async () => {
    db.tables.student_challenges = [readyWithoutReading({ status: "completed" })];
    await startStudentChallenge("member", String(row().id));
    await vi.waitFor(() => expect((row().content as Content).lesson?.content?.length).toBeGreaterThan(0));
  });
});
