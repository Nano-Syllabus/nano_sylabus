import { beforeEach, describe, expect, it, vi } from "vitest";
import { communityLearningFixture } from "../helpers/learning-database";
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  access: vi.fn(),
  prerequisites: vi.fn(),
  reading: vi.fn(),
  solved: vi.fn(),
  practiceTopics: vi.fn(),
  createExam: vi.fn(),
  submitExam: vi.fn(),
  submitExamFile: vi.fn(),
  gradeAnswers: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/lib/student-courses", () => ({
  getStudentCourseSubjectAccessForCourse: mocks.access,
  getStudentCourseSubjectAccess: mocks.access,
}));
vi.mock("@/lib/teacher-app/client", async (original) => ({
  ...(await original<typeof import("@/lib/teacher-app/client")>()),
  getTeacherChallengePrerequisites: mocks.prerequisites,
  getTeacherChallengeReading: mocks.reading,
  getTeacherChallengeSolvedQuestions: mocks.solved,
  getTeacherPracticeTopics: mocks.practiceTopics,
  createTeacherChallengeExam: mocks.createExam,
  submitTeacherChallengeExam: mocks.submitExam,
  submitTeacherChallengeExamFile: mocks.submitExamFile,
  gradeTeacherAnswers: mocks.gradeAnswers,
}));
import {
  getStudentChallengeContent,
  restartStudentChallenge,
  startStudentChallenge,
  submitStudentChallengeAttempt,
  submitStudentChallengeFile,
} from "@/lib/data/student-challenges";
import { invalidateMemo } from "@/lib/http/memo";
import { TeacherApiError } from "@/lib/teacher-app/client";

describe("starting a saved syllabus challenge", () => {
  let db: ReturnType<typeof communityLearningFixture>;

  /** The row as it stands once the background half of the build has landed. */
  const settled = () =>
    vi.waitFor(() => {
      const row = db.tables.student_challenges[0];
      expect((row.content as { contentStatus?: string })?.contentStatus).toBe("ready");
      return row;
    });

  beforeEach(() => {
    vi.clearAllMocks();
    // The collection key is memoized per teacher, so a run that did not clear it
    // would serve the previous test's fixture.
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
    mocks.prerequisites.mockResolvedValue({
      can_start: true,
      topics: [{ topic_key: "provider-42", title: "Identifiers" }],
      prerequisites: [],
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
    mocks.solved.mockResolvedValue({
      questions: [],
      grounded: false,
      warnings: [],
    });
    mocks.practiceTopics.mockResolvedValue({
      question_bank_questions: 0,
      topics: [{ topic_key: "provider-42", title: "Identifiers", qb_question_count: 0 }],
    });
    mocks.createExam.mockResolvedValue({
      attempt_id: "attempt-1",
      subject: "Nims",
      topics: [{ topic_key: "provider-42", title: "Identifiers", order_index: 0 }],
      questions: [
        {
          id: "q1",
          topic_key: "provider-42",
          topic: "Identifiers",
          marks: 10,
          question_type: "Short answer",
          text: "Explain identifiers.",
        },
        {
          id: "q2",
          topic_key: "provider-42",
          topic: "Identifiers",
          marks: 10,
          question_type: "Short answer",
          text: "Give one identifier example.",
        },
      ],
      total_marks: 20,
      pass_marks: 8,
      duration_minutes: 20,
      expires_at: new Date(Date.now() + 20 * 60_000).toISOString(),
      warning: null,
    });
    mocks.submitExamFile.mockResolvedValue({
      attempt_id: "attempt-1",
      subject: "Nims",
      results: [],
      total_score: 8,
      total_marks: 20,
      percentage: 0.4,
      pass_marks: 8,
      passed: true,
      graded: true,
    });
  });

  it("opens the published provider topic and retains its ID for progress", async () => {
    const result = await startStudentChallenge("member", "challenge-1");
    expect(mocks.prerequisites).toHaveBeenCalledWith("collection", {
      subject: "Nims",
      topics: ["provider-42"],
      limit: 3,
    });
    expect(mocks.reading).toHaveBeenCalledWith("collection", {
      subject: "Nims",
      topics: ["provider-42"],
    });
    expect(result?.topicKey).toBe("provider-42");
    expect(result?.content?.topicKeys).toEqual(["provider-42"]);

    await settled();
    expect(mocks.solved).toHaveBeenCalledWith("collection", {
      subject: "Nims",
      topics: ["provider-42"],
      limit: 2,
    });
    expect(mocks.createExam).toHaveBeenCalledWith("collection", {
      subject: "Nims",
      topics: ["provider-42"],
      questions: 2,
      duration_minutes: 20,
      pass_percent: 40,
      exclude_questions: [],
    });
    expect(db.tables.student_challenges[0].external_paper_id).toBe("attempt-1");
  });

  it("hands back the lesson before the exam has been built", async () => {
    let releaseSolved = () => {};
    mocks.solved.mockReturnValue(
      new Promise((resolve) => {
        releaseSolved = () => resolve({ questions: [], grounded: true, warnings: [] });
      }),
    );

    const result = await startStudentChallenge("member", "challenge-1");

    expect(result?.content?.contentStatus).toBe("pending");
    expect(result?.content?.lesson.content).toEqual(["Source material"]);
    expect(result?.content?.examQuestions).toEqual([]);
    expect(mocks.createExam).not.toHaveBeenCalled();

    releaseSolved();
    await settled();
    expect(mocks.createExam).toHaveBeenCalledTimes(1);
  });

  it("does not issue a second exam when a pending challenge is reopened", async () => {
    let releaseSolved = () => {};
    mocks.solved.mockReturnValue(
      new Promise((resolve) => {
        releaseSolved = () => resolve({ questions: [], grounded: true, warnings: [] });
      }),
    );
    await startStudentChallenge("member", "challenge-1");

    const reopened = await startStudentChallenge("member", "challenge-1");

    expect(reopened?.content?.contentStatus).toBe("pending");
    expect(mocks.prerequisites).toHaveBeenCalledTimes(1);
    expect(mocks.reading).toHaveBeenCalledTimes(1);

    releaseSolved();
    await settled();
    expect(mocks.createExam).toHaveBeenCalledTimes(1);
  });

  it("keeps the worked examples out of the exam it then sets", async () => {
    mocks.solved.mockResolvedValue({
      questions: [
        { id: "s1", text: "Worked: name three identifiers.", solution: "…", topic: "Identifiers" },
      ],
      grounded: true,
      warnings: [],
    });

    await startStudentChallenge("member", "challenge-1");
    await settled();

    expect(mocks.createExam).toHaveBeenCalledWith(
      "collection",
      expect.objectContaining({ exclude_questions: ["Worked: name three identifiers."] }),
    );
    // A grounded response needs no coverage lookup to phrase its warning.
    expect(mocks.practiceTopics).not.toHaveBeenCalled();
  });

  it("replaces a legacy Question Bank document challenge with a real syllabus topic", async () => {
    db.tables.student_challenges[0].subject_name = "Applied Mechanics";
    db.tables.student_challenges[0].topic_key = "applied_mechanics_qb";
    db.tables.student_challenges[0].topic_title = "Applied Mechanics QB";
    mocks.access.mockResolvedValue({ teacherId: "teacher-1", subjectName: "Applied Mechanics" });
    mocks.prerequisites.mockResolvedValue({
      can_start: true,
      topics: [{ topic_key: "introduction", title: "Introduction" }],
      prerequisites: [],
      blockers: [],
      warnings: [],
    });

    const result = await startStudentChallenge("member", "challenge-1");

    expect(mocks.prerequisites).toHaveBeenCalledWith("collection", {
      subject: "Applied Mechanics",
      topics: [],
      limit: 3,
    });
    expect(result?.topicKey).toBe("introduction");
    expect(result?.topicTitle).toBe("Introduction");
  });

  it("does not tell students to upload a Question Bank that is already indexed", async () => {
    mocks.solved.mockResolvedValue({
      questions: [],
      grounded: false,
      warnings: ["No past questions on Identifiers were found. Upload past papers to ground them."],
    });
    mocks.practiceTopics.mockResolvedValue({
      question_bank_questions: 12,
      topics: [{ topic_key: "provider-42", title: "Identifiers", qb_question_count: 3 }],
    });

    await startStudentChallenge("member", "challenge-1");
    await settled();
    const ready = await getStudentChallengeContent("member", "challenge-1");

    expect(ready?.content?.solvedWarning).toContain("Past questions are indexed for Identifiers");
    expect(ready?.content?.solvedWarning).not.toContain("Upload past papers");
  });

  it("submits the handwritten sheet against the saved live challenge attempt", async () => {
    await startStudentChallenge("member", "challenge-1");
    await settled();
    const file = {
      name: "answers.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("answer sheet"),
    };

    await submitStudentChallengeFile({
      userId: "member",
      challengeId: "challenge-1",
      studentName: "Student",
      file,
    });

    expect(mocks.submitExamFile).toHaveBeenCalledWith("collection", "attempt-1", {
      studentName: "Student",
      file,
    });
  });

  it("marks a typed sitting from its stored questions when the attempt is gone", async () => {
    mocks.submitExam.mockRejectedValue(new TeacherApiError("attempt not found", 404));
    mocks.gradeAnswers.mockResolvedValue({
      results: [
        {
          question_id: "q1",
          chapter: "Identifiers",
          question: "Explain identifiers.",
          marks: 10,
          score: 9,
          feedback: "Sound.",
        },
      ],
      total_score: 9,
      total_marks: 10,
      graded: true,
      evaluation: {},
    });
    await startStudentChallenge("member", "challenge-1");
    await settled();

    const graded = await submitStudentChallengeAttempt({
      userId: "member",
      challengeId: "challenge-1",
      answers: [{ questionId: "q1", answerText: "A name for a value." }],
    });

    expect(mocks.gradeAnswers).toHaveBeenCalledWith("collection", {
      items: [
        {
          question_id: "q1",
          question: "Explain identifiers.",
          marks: 10,
          chapter: "Identifiers",
          student_answer: "A name for a value.",
        },
        {
          question_id: "q2",
          question: "Give one identifier example.",
          marks: 10,
          chapter: "Identifiers",
          student_answer: "",
        },
      ],
    });
    expect(graded.total_score).toBe(9);
    expect(graded.results[0].student_answer).toBe("A name for a value.");
    expect(graded.stored).toBe(false);
  });

  it("keeps the assignment intact when the provider is unavailable", async () => {
    mocks.prerequisites.mockRejectedValue(new TeacherApiError("Unavailable", 503));
    await expect(startStudentChallenge("member", "challenge-1")).rejects.toThrow();
    expect(mocks.prerequisites).toHaveBeenCalledTimes(1);
    expect(mocks.reading).not.toHaveBeenCalled();
    expect(mocks.solved).not.toHaveBeenCalled();
    expect(db.tables.student_challenges[0].status).toBe("assigned");
  });

  it("retries prerequisites without a stale provider topic key", async () => {
    mocks.prerequisites.mockRejectedValueOnce(new TeacherApiError("Unknown topic", 404));

    const result = await startStudentChallenge("member", "challenge-1");

    expect(result?.topicKey).toBe("provider-42");
    expect(mocks.prerequisites).toHaveBeenNthCalledWith(1, "collection", {
      subject: "Nims",
      topics: ["provider-42"],
      limit: 3,
    });
    expect(mocks.prerequisites).toHaveBeenNthCalledWith(2, "collection", {
      subject: "Nims",
      topics: [],
      limit: 3,
    });
  });

  it("does not start a topic when its material cannot support an exam", async () => {
    const payload = await mocks.prerequisites();
    mocks.prerequisites.mockResolvedValue({ ...payload, can_start: false });
    await expect(startStudentChallenge("member", "challenge-1")).rejects.toThrow(
      "not taught by the course material",
    );
    expect(db.tables.student_challenges[0].status).toBe("assigned");
  });

  it("still checks membership before issuing an exam", async () => {
    mocks.access.mockResolvedValue(null);
    await expect(startStudentChallenge("member", "challenge-1")).rejects.toThrow(
      "no longer have access",
    );
    expect(mocks.prerequisites).not.toHaveBeenCalled();
  });

  it("does not expose a completed challenge after its community access ends", async () => {
    db.tables.student_challenges[0].status = "completed";
    mocks.access.mockResolvedValue(null);

    await expect(startStudentChallenge("member", "challenge-1")).rejects.toThrow(
      "no longer have access",
    );
    expect(mocks.prerequisites).not.toHaveBeenCalled();
  });

  it("restarts a completed challenge with a fresh sitting", async () => {
    db.tables.student_challenges[0].status = "completed";

    const result = await restartStudentChallenge("member", "challenge-1");

    expect(result?.status).toBe("started");
    expect(mocks.prerequisites).toHaveBeenCalledTimes(1);
    expect(mocks.reading).toHaveBeenCalledTimes(1);

    await settled();
    expect(mocks.solved).toHaveBeenCalledTimes(1);
    expect(mocks.createExam).toHaveBeenCalledTimes(1);
  });
});
