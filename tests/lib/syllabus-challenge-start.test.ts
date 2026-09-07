import { beforeEach, describe, expect, it, vi } from "vitest";
import { communityLearningFixture } from "../helpers/learning-database";
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  access: vi.fn(),
  prerequisites: vi.fn(),
  reading: vi.fn(),
  solved: vi.fn(),
  practiceTopics: vi.fn(),
  generatePracticePaper: vi.fn(),
  submitExamFile: vi.fn(),
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
  generateTeacherPracticePaper: mocks.generatePracticePaper,
  gradeTeacherPracticePaperFile: mocks.submitExamFile,
}));
import {
  restartStudentChallenge,
  startStudentChallenge,
  submitStudentChallengeFile,
} from "@/lib/data/student-challenges";
import { TeacherApiError } from "@/lib/teacher-app/client";

describe("starting a saved syllabus challenge", () => {
  let db: ReturnType<typeof communityLearningFixture>;
  beforeEach(() => {
    vi.clearAllMocks();
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
    mocks.generatePracticePaper.mockResolvedValue({
      id: "practice-set-1",
      title: "Nims challenge",
      subject: "Nims",
      chapters: ["Identifiers"],
      questions: [
        {
          id: "q1",
          text: "Explain identifiers.",
          chapter: "Identifiers",
          band_label: "Challenge",
          marks: 10,
          question_type: "Short answer",
        },
        {
          id: "q2",
          text: "Give one identifier example.",
          chapter: "Identifiers",
          band_label: "Challenge",
          marks: 10,
          question_type: "Short answer",
        },
      ],
      total_marks: 20,
      pass_marks: 8,
    });
    mocks.submitExamFile.mockResolvedValue({
      submission_id: "submission-1",
      set_id: "practice-set-1",
      student_name: "Student",
      source: "file",
      results: [],
      total_score: 8,
      total_marks: 10,
      graded: true,
      evaluation: {},
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
    expect(mocks.solved).toHaveBeenCalledWith("collection", {
      subject: "Nims",
      topics: ["provider-42"],
      limit: 2,
    });
    expect(mocks.generatePracticePaper).toHaveBeenCalledWith("collection", {
      subject: "Nims",
      chapters: ["Identifiers"],
      title: "Nims challenge",
      instruction: "Set concise handwritten-answer questions on only the requested topic.",
      pass_marks: 8,
      bands: [
        {
          label: "Challenge",
          question_type: "Short answer",
          count: 2,
          marks_each: 10,
        },
      ],
    });
    expect(result?.topicKey).toBe("provider-42");
    expect(result?.content?.topicKeys).toEqual(["provider-42"]);
    expect(db.tables.student_challenges[0].external_paper_id).toBe("practice-set-1");
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

    const result = await startStudentChallenge("member", "challenge-1");

    expect(result?.content?.solvedWarning).toContain("Past questions are indexed for Identifiers");
    expect(result?.content?.solvedWarning).not.toContain("Upload past papers");
  });

  it("submits the handwritten sheet against the saved live challenge attempt", async () => {
    await startStudentChallenge("member", "challenge-1");
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

    expect(mocks.submitExamFile).toHaveBeenCalledWith("collection", "practice-set-1", {
      studentName: "Student",
      file,
    });
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
    expect(mocks.solved).toHaveBeenCalledTimes(1);
    expect(mocks.generatePracticePaper).toHaveBeenCalledTimes(1);
  });
});
