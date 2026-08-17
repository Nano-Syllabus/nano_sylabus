import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getStudentCourseSubjectAccess: vi.fn(),
  listTenantSubjects: vi.fn(),
  findTenantSubjectForCourseSubject: vi.fn(),
  generateMcqSet: vi.fn(),
  getMcqSet: vi.fn(),
  checkMcqSet: vi.fn(),
  checkMcqItems: vi.fn(),
  recordPracticeEvaluation: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/student-courses", () => ({
  getStudentCourseSubjectAccess: mocks.getStudentCourseSubjectAccess,
}));
vi.mock("@/lib/data/student-mastery", () => ({
  recordPracticeEvaluation: mocks.recordPracticeEvaluation,
}));
vi.mock("@/lib/tenant/client", () => ({
  listTenantSubjects: mocks.listTenantSubjects,
  findTenantSubjectForCourseSubject: mocks.findTenantSubjectForCourseSubject,
  generateMcqSet: mocks.generateMcqSet,
  getMcqSet: mocks.getMcqSet,
  checkMcqSet: mocks.checkMcqSet,
  checkMcqItems: mocks.checkMcqItems,
}));

import { POST as generate } from "@/app/api/student/practice/mcq/route";
import { POST as check } from "@/app/api/student/practice/mcq/[setId]/check/route";
import { POST as checkSet } from "@/app/api/student/practice/mcq/set-check/route";
import { GET as getSet } from "@/app/api/student/practice/mcq/[setId]/route";
import { POST as checkItems } from "@/app/api/student/practice/mcq/check/route";

const subject = {
  name: "Digital Logic",
  slug: "digital-logic",
  namespace: "Tribhuvan University",
  chunk_count: 42,
};

describe("student MCQ practice routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "student-1" } } })) },
    });
    mocks.getStudentCourseSubjectAccess.mockResolvedValue({
      courseId: "course-1",
      teacherId: "teacher-1",
      subjectSlug: "digital-logic",
      subjectName: "Digital Logic",
      folderPath: "Digital Logic",
    });
    mocks.listTenantSubjects.mockResolvedValue([subject]);
    mocks.findTenantSubjectForCourseSubject.mockReturnValue(subject);
    mocks.recordPracticeEvaluation.mockResolvedValue("attempt-1");
  });

  it("generates an answer-key-safe set scoped to the enrolled subject", async () => {
    mocks.generateMcqSet.mockResolvedValue({
      set_id: "mcq-set-1",
      subject: "digital-logic",
      questions: [
        {
          id: "q1",
          chapter: "Combinational Logic",
          marks: 1,
          text: "Which gate inverts its input?",
          options: ["AND", "NOT", "OR", "XOR"],
          correct_option: "B",
          explanation: "This must never reach the browser before checking.",
        },
      ],
      total_marks: 6,
      negative_marks: 0.25,
      expires_at: "2026-08-17T12:00:00.000Z",
    });

    const response = await generate(
      new Request("http://localhost/api/student/practice/mcq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "digital-logic",
          chapters: ["Combinational Logic"],
          bands: [{ marksEach: 1, count: 4 }, { marksEach: 2, count: 1 }],
          perChapter: true,
          optionsPerQuestion: 5,
          negativeMarks: 0.25,
          instruction: "Prefer conceptual traps.",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ setId: "mcq-set-1", totalMarks: 6, negativeMarks: 0.25 });
    expect(mocks.generateMcqSet).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "digital-logic",
        namespaces: ["Tribhuvan University"],
        chapters: ["Combinational Logic"],
        bands: [
          { marks_each: 1, count: 4 },
          { marks_each: 2, count: 1 },
        ],
        per_chapter: true,
        options_per_question: 5,
        instruction: "Prefer conceptual traps.",
      }),
    );
    expect(JSON.stringify(payload)).not.toContain("correct_option");
    expect(JSON.stringify(payload)).not.toContain("This must never reach the browser");
  });

  it("checks selections exactly and returns the explanation for review", async () => {
    mocks.checkMcqSet.mockResolvedValue({
      set_id: "mcq-set-1",
      results: [
        {
          question_id: "q1",
          marks: 1,
          score: 0,
          selected: "AND",
          selected_option: "A — AND",
          correct: "B",
          correct_option: "B — NOT",
          is_correct: false,
          explanation: "A NOT gate produces the complement of its input.",
        },
      ],
      total_score: 0,
      total_marks: 1,
      penalty: 0.25,
      negative_marks: 0.25,
      stored: false,
    });

    const response = await check(
      new Request("http://localhost/api/student/practice/mcq/mcq-set-1/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "digital-logic",
          answers: [{ questionId: "q1", selected: "AND", selectedChoice: 0 }],
        }),
      }),
      { params: Promise.resolve({ setId: "mcq-set-1" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.penalty).toBe(0.25);
    expect(payload.results[0]).toMatchObject({
      question_id: "q1",
      score: 0,
      student_answer: "A — AND",
    });
    expect(payload.results[0].feedback).toContain("Correct answer: B — NOT");
    expect(payload.results[0].feedback).toContain("A NOT gate");
    expect(mocks.checkMcqSet).toHaveBeenCalledWith("mcq-set-1", {
      answers: [{ question_id: "q1", selected: "AND" }],
    });
  });

  it("checks a set through the static hand-in route used by the UI", async () => {
    mocks.checkMcqSet.mockResolvedValue({
      set_id: "mcq-set-static",
      results: [{ question_id: "q1", marks: 1, score: 1, selected: "B", correct: "B", is_correct: true }],
      total_score: 1,
      total_marks: 1,
      stored: false,
    });

    const response = await checkSet(new Request("http://localhost/api/student/practice/mcq/set-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        setId: "mcq-set-static",
        subject: "digital-logic",
        answers: [{ questionId: "q1", selected: "B", selectedChoice: 1 }],
      }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.totalScore).toBe(1);
    expect(mocks.checkMcqSet).toHaveBeenCalledWith("mcq-set-static", {
      answers: [{ question_id: "q1", selected: "B" }],
    });
  });

  it("does not generate MCQs for an unenrolled subject", async () => {
    mocks.getStudentCourseSubjectAccess.mockResolvedValueOnce(null);

    const response = await generate(
      new Request("http://localhost/api/student/practice/mcq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: "digital-logic", bands: [{ marksEach: 1, count: 5 }] }),
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.generateMcqSet).not.toHaveBeenCalled();
  });

  it("reopens a shared set without exposing its answer key", async () => {
    mocks.getMcqSet.mockResolvedValue({
      set_id: "shared-1",
      subject: "digital-logic",
      questions: [{
        id: "q1",
        chapter: "Gates",
        marks: 1,
        text: "Which gate inverts?",
        options: [{ key: "A", text: "AND" }, { key: "B", text: "NOT" }],
        correct: "B",
        explanation: "Must stay hidden.",
      }],
      total_marks: 1,
      negative_marks: 0,
      expires_at: "2026-08-17T12:00:00.000Z",
    });

    const response = await getSet(
      new Request("http://localhost/api/student/practice/mcq/shared-1?subject=digital-logic"),
      { params: Promise.resolve({ setId: "shared-1" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getMcqSet).toHaveBeenCalledWith("shared-1");
    expect(JSON.stringify(payload)).not.toContain("correct");
    expect(JSON.stringify(payload)).not.toContain("Must stay hidden");
  });

  it("checks self-contained MCQs without creating a stored set", async () => {
    mocks.checkMcqItems.mockResolvedValue({
      set_id: "",
      results: [{ question_id: "custom-1", marks: 3.5, score: 3.5, selected: "2", correct: "B", is_correct: true }],
      total_score: 3.5,
      total_marks: 3.5,
      penalty: 0,
      negative_marks: 3,
      correct_count: 1,
      wrong_count: 0,
      unattempted_count: 0,
      stored: false,
    });

    const response = await checkItems(new Request("http://localhost/api/student/practice/mcq/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        negativeMarks: 3,
        items: [{
          questionId: "custom-1",
          question: "Which option is correct?",
          chapter: "Gates",
          marks: 3.5,
          options: [
            { key: "", text: "First" },
            { key: "", text: "Second" },
            { key: "", text: "Third" },
            { key: "", text: "Fourth" },
            { key: "", text: "Fifth" },
            { key: "", text: "Sixth" },
          ],
          correct: "B",
          selected: "2",
          explanation: "The second option is correct.",
        }],
      }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      correctCount: 1,
      wrongCount: 0,
      unattemptedCount: 0,
    });
    expect(mocks.checkMcqItems).toHaveBeenCalledWith({
      negative_marks: 3,
      items: [{
        question_id: "custom-1",
        question: "Which option is correct?",
        chapter: "Gates",
        marks: 3.5,
        options: [
          { key: "", text: "First" },
          { key: "", text: "Second" },
          { key: "", text: "Third" },
          { key: "", text: "Fourth" },
          { key: "", text: "Fifth" },
          { key: "", text: "Sixth" },
        ],
        correct: "B",
        selected: "2",
        explanation: "The second option is correct.",
      }],
    });
  });
});
