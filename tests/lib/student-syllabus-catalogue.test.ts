import { beforeEach, describe, expect, it, vi } from "vitest";
import { communityLearningFixture } from "../helpers/learning-database";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  mastery: vi.fn(),
  attempts: vi.fn(),
  courses: vi.fn(),
  communities: vi.fn(),
  private: vi.fn(),
  ensure: vi.fn(),
  history: vi.fn(),
  topics: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/lib/data/student-mastery", () => ({
  listTopicMastery: mocks.mastery,
  listPracticeAttempts: mocks.attempts,
}));
vi.mock("@/lib/student-courses", () => ({
  listStudentCourseSubjects: mocks.courses,
  listStudentCommunitySubjectAccess: mocks.communities,
  listCreatorPrivateSubjectAccess: mocks.private,
}));
vi.mock("@/lib/data/student-challenges", () => ({
  ensureDailyChallenges: mocks.ensure,
  listCompletedStudentChallenges: mocks.history,
  isMissingChallengeTable: () => false,
}));
vi.mock("@/lib/teacher-app/client", () => ({ getTeacherPracticeTopics: mocks.topics }));
import { getStudentChallengeDashboard } from "@/lib/data/student-challenge-dashboard";

describe("student challenge dashboard uses the community learning map", () => {
  let db: ReturnType<typeof communityLearningFixture>;
  beforeEach(() => {
    vi.clearAllMocks();
    db = communityLearningFixture();
    mocks.admin.mockReturnValue({
      ...db.admin,
      rpc: () => ({ maybeSingle: async () => ({ data: {}, error: null }) }),
    });
    mocks.mastery.mockResolvedValue([]);
    mocks.attempts.mockResolvedValue([]);
    mocks.courses.mockResolvedValue([]);
    mocks.private.mockResolvedValue([]);
    mocks.communities.mockResolvedValue([
      {
        courseId: "course-1",
        teacherId: "teacher-1",
        subjectSlug: "teacher_nims",
        subjectName: "Nims",
        folderPath: "Nims",
        accessKind: "community",
      },
    ]);
    mocks.ensure.mockResolvedValue([]);
    mocks.history.mockResolvedValue({ challenges: [], page: 1, total: 0, totalPages: 0 });
    mocks.topics.mockResolvedValue({
      topics: [{ topic_key: "provider-identifiers", title: "Identifiers" }],
    });
  });

  it("assigns old saved syllabus topics to a new member without a second extraction", async () => {
    db.tables.teacher_subject_syllabi.push({
      teacher_id: "teacher-1",
      subject_slug: "teacher_nims",
      structure: [{ title: "Tokens", topics: [{ name: "Identifiers" }] }],
    });
    const result = await getStudentChallengeDashboard("member", 1, {
      courseId: "course-1",
      subjectSlug: "teacher_nims",
    });
    expect(result.totalTopics).toBe(1);
    expect(result.subjects[0].topicDataAvailable).toBe(true);
    expect(result.subjects[0].nextTopic?.title).toBe("Identifiers");
    expect(mocks.ensure).toHaveBeenCalledWith(
      "member",
      [expect.objectContaining({ topicTitle: "Identifiers", topicKey: "provider-identifiers" })],
      { minimumRecommendationCount: 3 },
    );
    expect(mocks.topics).toHaveBeenCalledExactlyOnceWith("collection", "Nims");
  });

  it("uses shared provider IDs and saved mastery instead of a stale external catalogue", async () => {
    db.tables.community_subject_topics.push({
      id: "topic",
      community_subject_id: "subject-1",
      topic_key: "identifier",
      title: "Identifiers",
    });
    mocks.mastery.mockResolvedValue([
      {
        courseId: "course-1",
        subjectSlug: "teacher_nims",
        topicKey: "identifier",
        percentage: 80,
        status: "strong",
        attempts: 1,
      },
    ]);
    const result = await getStudentChallengeDashboard("member");
    expect(result.totalTopics).toBe(1);
    expect(result.readiness).toBe(80);
    expect(result.practicedTopics).toBe(1);
    expect(mocks.topics).not.toHaveBeenCalled();
  });

  it("does not replace a genuinely empty shared map with unrelated provider topics", async () => {
    const result = await getStudentChallengeDashboard("member");
    expect(result.totalTopics).toBe(0);
    expect(mocks.ensure).toHaveBeenCalledWith("member", [], expect.anything());
    expect(mocks.topics).not.toHaveBeenCalled();
  });

  it("retains the existing provider flow for non-community courses", async () => {
    db.tables.communities = [];
    const result = await getStudentChallengeDashboard("member");
    expect(result.totalTopics).toBe(1);
    expect(mocks.topics).toHaveBeenCalledWith("collection", "Nims", {
      totalMarks: 20,
      maxQuestions: 5,
    });
  });
});
