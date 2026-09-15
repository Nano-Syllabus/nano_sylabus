import { beforeEach, describe, expect, it, vi } from "vitest";
import { communityLearningFixture } from "../helpers/learning-database";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  access: vi.fn(),
  topics: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/lib/student-courses", () => ({
  listStudentCommunitySubjectAccess: mocks.access,
}));
vi.mock("@/lib/data/community-learning-topics", () => ({
  readCourseLearningTopics: mocks.topics,
}));

import { getStudentRevisionDocs } from "@/lib/data/student-revision-docs";

/**
 * What these guard is the claim the revision docs make about every page in them:
 * "you passed this, and here is what it said."
 *
 * So: only passed challenges, only subjects the student still has, in the
 * curriculum's own order, with the reading read back rather than regenerated.
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

  it("reports a missing challenge table as unavailable, not as nothing revised", async () => {
    db.tables.student_challenges = [];
    db.failures.set("student_challenges:select", "missing");
    mocks.admin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
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
