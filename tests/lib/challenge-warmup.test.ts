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

import { startStudentChallenge, warmStudentChallenge } from "@/lib/data/student-challenges";
import { invalidateMemo } from "@/lib/http/memo";

/**
 * Building the first challenge before the student presses Start.
 *
 * Start is two upstream calls — the topic's past questions, then a written
 * reading — and neither depends on who is sitting it, so the first card of each
 * subject was a spinner nobody needed to watch. Warming writes the same lesson
 * onto the row in advance; what it must never do is start the student's clock.
 */

describe("warming a challenge before it is started", () => {
  let db: ReturnType<typeof communityLearningFixture>;

  const row = () => db.tables.student_challenges[0];

  beforeEach(() => {
    vi.clearAllMocks();
    invalidateMemo("challenge:collection-sk");
    db = communityLearningFixture();
    db.tables.student_challenges = [
      {
        id: "challenge-1",
        user_id: "member",
        course_id: "course-1",
        subject_slug: "teacher_nims",
        subject_name: "Nims",
        topic_key: "provider-42",
        topic_title: "Identifiers",
        status: "assigned",
      },
    ];
    mocks.admin.mockReturnValue(db.admin);
    mocks.access.mockResolvedValue({ teacherId: "teacher-1", subjectName: "Nims" });
    mocks.pastQuestions.mockResolvedValue({
      can_start: true,
      topics: [{ topic_key: "provider-42", title: "Identifiers" }],
      questions: [],
      grounded: false,
      blockers: [],
      warnings: [],
    });
    mocks.reading.mockResolvedValue({
      reading: {
        headline: "Identifiers",
        content: "Source material",
        focus: "Identifiers",
        sources: [],
      },
      warnings: [],
    });
    mocks.solved.mockResolvedValue({ questions: [], grounded: false, warnings: [] });
    mocks.practiceTopics.mockResolvedValue({ question_bank_questions: 0, topics: [] });
    mocks.createExam.mockResolvedValue({
      attempt_id: "attempt-1",
      subject: "Nims",
      topics: [],
      questions: [],
      total_marks: 20,
      pass_marks: 8,
      duration_minutes: 20,
      expires_at: new Date(Date.now() + 20 * 60_000).toISOString(),
      warning: null,
    });
  });

  it("writes the lesson without starting the student's clock", async () => {
    await expect(warmStudentChallenge("member", "challenge-1")).resolves.toBe("warmed");

    expect((row().content as { provider?: string }).provider).toBe("collection-challenge-v1");
    // Still theirs to start: the hub must say Start, not Continue, and the
    // twenty minutes must not have begun while nobody was looking.
    expect(row().status).toBe("assigned");
    expect(row().started_at).toBeUndefined();
    // No paper either — the exam is per sitting and its clock starts with it.
    expect(mocks.createExam).not.toHaveBeenCalled();
  });

  it("makes the start that follows it free", async () => {
    await warmStudentChallenge("member", "challenge-1");
    mocks.pastQuestions.mockClear();
    mocks.reading.mockClear();

    const detail = await startStudentChallenge("member", "challenge-1");

    expect(detail?.content?.lesson.content).toBeTruthy();
    // The whole point: the two calls the student used to wait for are already
    // paid for, so Start is a read.
    expect(mocks.pastQuestions).not.toHaveBeenCalled();
    expect(mocks.reading).not.toHaveBeenCalled();
    // …and it is still a real start. A warmed lesson carries the same
    // `contentStatus: "pending"` a fresh one does, so the reopen short-circuit
    // would otherwise hand it back and leave the challenge unstarted, with no
    // clock and no paper coming.
    expect(detail?.status).toBe("started");
    expect(row().started_at).toBeTruthy();
    await vi.waitFor(() => expect(mocks.createExam).toHaveBeenCalled());
  });

  it("leaves a challenge the student has already opened alone", async () => {
    row().status = "started";

    await expect(warmStudentChallenge("member", "challenge-1")).resolves.toBe("skipped");
    expect(mocks.pastQuestions).not.toHaveBeenCalled();
  });

  it("warms only once — a second pass sees the lesson and stops", async () => {
    await warmStudentChallenge("member", "challenge-1");
    mocks.pastQuestions.mockClear();

    await expect(warmStudentChallenge("member", "challenge-1")).resolves.toBe("skipped");
    expect(mocks.pastQuestions).not.toHaveBeenCalled();
  });

  it("stays silent when the course material cannot build it", async () => {
    mocks.pastQuestions.mockRejectedValue(new Error("upstream down"));

    await expect(warmStudentChallenge("member", "challenge-1")).resolves.toBe("failed");
    // Nothing is written, and above all no error is parked on a row the student
    // never asked to have built.
    expect(row().content).toBeUndefined();
    expect(row().status).toBe("assigned");
  });
});
