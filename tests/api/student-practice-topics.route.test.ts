import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  listTenantSubjects: vi.fn(),
  listPracticeTopics: vi.fn(),
  listTopicMastery: vi.fn(),
  studentHasCourseSubjectAccess: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/tenant/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tenant/client")>();
  return {
    ...actual,
    listTenantSubjects: mocks.listTenantSubjects,
    listPracticeTopics: mocks.listPracticeTopics,
  };
});
vi.mock("@/lib/data/student-mastery", () => ({ listTopicMastery: mocks.listTopicMastery }));
vi.mock("@/lib/student-courses", () => ({
  studentHasCourseSubjectAccess: mocks.studentHasCourseSubjectAccess,
}));

import { GET } from "@/app/api/student/practice/topics/route";

describe("GET /api/student/practice/topics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "student-1" } } })) },
    });
    mocks.listTenantSubjects.mockResolvedValue([
      {
        name: "Digital Logic",
        slug: "digital-logic",
        namespace: "teacher-a",
        namespace_slug: "teacher-a",
        full_path: "teacher-a/Digital Logic",
        folder_path: "teacher-a/Digital Logic",
        chunk_count: 10,
      },
    ]);
    mocks.listPracticeTopics.mockResolvedValue({
      topic_source: "syllabus",
      question_bank_questions: 100,
      weightage_basis: "question_bank_marks",
      topics: [
        {
          topic_key: "logic_gates",
          title: "Logic Gates",
          weight: 0.15,
          syllabus_weight: 0.15,
          question_count: 10,
          weight_source: "question_bank_marks",
        },
      ],
      suggested_plan: [],
    });
    mocks.listTopicMastery.mockResolvedValue([]);
    mocks.studentHasCourseSubjectAccess.mockResolvedValue(true);
  });

  it("passes selected quick drill size to the tenant topics planner", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/student/practice/topics?subject=Digital%20Logic&totalMarks=40&maxQuestions=10",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.listPracticeTopics).toHaveBeenCalledWith({
      subject: "digital-logic",
      namespaces: ["teacher-a"],
      totalMarks: 40,
      maxQuestions: 10,
    });
  });

  it("keeps an available subject visible when its teacher has not indexed content", async () => {
    mocks.listTenantSubjects.mockResolvedValueOnce([
      {
        name: "Nepali",
        slug: "nepali",
        namespace: "teacher-b",
        namespace_slug: "teacher-b",
        full_path: "teacher-b/Nepali",
        folder_path: "teacher-b/Nepali",
        chunk_count: 0,
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/student/practice/topics?subject=Nepali"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      practiceAvailable: false,
      questionBankQuestions: 0,
      topics: [],
    });
    expect(mocks.listPracticeTopics).not.toHaveBeenCalled();
  });

  it("rejects practice for a subject outside the student's enrolled courses", async () => {
    mocks.studentHasCourseSubjectAccess.mockResolvedValueOnce(false);

    const response = await GET(
      new Request("http://localhost/api/student/practice/topics?subject=Digital%20Logic"),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("Enroll in a course containing this subject first.");
    expect(mocks.listPracticeTopics).not.toHaveBeenCalled();
  });
});
