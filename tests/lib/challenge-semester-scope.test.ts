import { beforeEach, describe, expect, it, vi } from "vitest";
import { communityLearningFixture } from "../helpers/learning-database";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  mastery: vi.fn(),
  attempts: vi.fn(),
  communities: vi.fn(),
  communityScope: vi.fn(),
  ensure: vi.fn(),
  warmups: vi.fn(),
  history: vi.fn(),
  topics: vi.fn(),
  learningTopics: vi.fn(),
  learningTopicsBatch: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/lib/data/student-mastery", () => ({
  listTopicMastery: mocks.mastery,
  listPracticeAttempts: mocks.attempts,
}));
vi.mock("@/lib/student-courses", () => ({
  listStudentCommunitySubjectAccess: mocks.communities,
  getStudentCommunityLearningScope: mocks.communityScope,
}));
vi.mock("@/lib/data/student-challenges", () => ({
  ensureDailyChallenges: mocks.ensure,
  listCompletedStudentChallenges: mocks.history,
  isMissingChallengeTable: () => false,
  scheduleChallengeWarmups: mocks.warmups,
}));
vi.mock("@/lib/teacher-app/client", () => ({ getTeacherPracticeTopics: mocks.topics }));
vi.mock("@/lib/data/community-learning-topics", () => ({
  readCourseLearningTopics: mocks.learningTopics,
  courseLearningTopicsKey: (r: { courseId: string; teacherId: string; subjectSlug: string }) =>
    `${r.courseId}\u0000${r.teacherId}\u0000${r.subjectSlug}`,
  readCourseLearningTopicsBatch: mocks.learningTopicsBatch,
}));
import { getStudentChallengeDashboard } from "@/lib/data/student-challenge-dashboard";

/**
 * A community course carries its whole programme. Every published subject in it
 * was reaching the daily queue, so a first-semester student was handed
 * Engineering Mathematics III — a subject they have not been taught, cannot
 * answer, and whose failed attempts still land on their record.
 */
const SEM_1 = { id: "term-1", yearNumber: 1, semesterNumber: 1, semesterInYear: 1, position: 0 };
const SEM_3 = { id: "term-3", yearNumber: 2, semesterNumber: 3, semesterInYear: 1, position: 2 };

function subject(slug: string, name: string, term: typeof SEM_1 | undefined) {
  return {
    courseId: "course-1",
    teacherId: "teacher-1",
    subjectSlug: slug,
    subjectName: name,
    folderPath: name,
    accessKind: "community" as const,
    term,
  };
}

describe("the daily queue is scoped to the student's own semester", () => {
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
    mocks.ensure.mockResolvedValue([]);
    mocks.history.mockResolvedValue({ challenges: [], page: 1, total: 0, totalPages: 0 });
    mocks.topics.mockResolvedValue({ topics: [{ topic_key: "t1", title: "A topic" }] });
    // Two subtopics per subject, so the round-robin below has something to
    // interleave and a single-subject queue would be visible as a failure.
    const topicsFor = (slug: string) => [
      { topic_key: `${slug}-1`, title: `${slug} one`, unit_number: "1", position: 0, blurb: "" },
      { topic_key: `${slug}-2`, title: `${slug} two`, unit_number: "1", position: 1, blurb: "" },
    ];
    mocks.learningTopics.mockImplementation(async (_c, _t, slug) => topicsFor(slug));
    mocks.learningTopicsBatch.mockImplementation(async (requests) => {
      const map = new Map();
      for (const r of requests) {
        map.set(`${r.courseId}\u0000${r.teacherId}\u0000${r.subjectSlug}`, topicsFor(r.subjectSlug));
      }
      return map;
    });
    mocks.communities.mockResolvedValue([
      subject("basic_electrical", "Basic Electrical Engineering", SEM_1),
      subject("applied_mechanics", "Applied Mechanics", SEM_1),
      subject("eng_math_iii", "Engineering Mathematics III", SEM_3),
    ]);
    mocks.communityScope.mockResolvedValue({
      communityId: "community-1",
      communitySlug: "bct",
      communityName: "BCT",
      courseId: "course-1",
      currentTermId: "term-1",
    });
  });

  it("keeps every first-semester subject and drops the later ones", async () => {
    const dashboard = await getStudentChallengeDashboard("member");

    const names = dashboard.subjects.map((s) => s.name).sort();
    expect(names).toEqual(["Applied Mechanics", "Basic Electrical Engineering"]);
    expect(names).not.toContain("Engineering Mathematics III");
  });

  it("mixes the semester's subjects rather than emptying the queue to one", async () => {
    // "Mix all the subjects" is the other half: scoping to a semester must not
    // collapse the queue onto whichever subject sorts first.
    const dashboard = await getStudentChallengeDashboard("member");
    const [recommendations] = mocks.ensure.mock.calls[0].slice(1);

    expect(new Set(recommendations.map((r: { subjectSlug: string }) => r.subjectSlug))).toEqual(
      new Set(["basic_electrical", "applied_mechanics"]),
    );
    // Round-robin: the first two come from different subjects.
    expect(recommendations[0].subjectSlug).not.toBe(recommendations[1].subjectSlug);
  });

  it("shows everything when the student has not picked a semester", async () => {
    mocks.communityScope.mockResolvedValue({
      communityId: "community-1",
      communitySlug: "bct",
      communityName: "BCT",
      courseId: "course-1",
      currentTermId: null,
    });

    const dashboard = await getStudentChallengeDashboard("member");

    expect(dashboard.subjects).toHaveLength(3);
  });

  it("shows nothing from other semesters when the chosen one has no subjects yet", async () => {
    // It used to fall back to the whole programme, and the daily queue is sized
    // one per subject in scope — so picking an unpublished semester filled the
    // hub with one challenge per subject of every other semester.
    mocks.communityScope.mockResolvedValue({
      communityId: "community-1",
      communitySlug: "bct",
      communityName: "BCT",
      courseId: "course-1",
      currentTermId: "term-nobody-published-yet",
    });

    const dashboard = await getStudentChallengeDashboard("member");

    expect(dashboard.subjects).toHaveLength(0);
    expect(dashboard.challenges).toHaveLength(0);
    const recommendations = mocks.ensure.mock.calls[0]?.[1] ?? [];
    expect(recommendations).toHaveLength(0);
  });
});

describe("the progress bar counts completed challenges, not every graded attempt", () => {
  let db: ReturnType<typeof communityLearningFixture>;
  // The batch reader's key: course, teacher and subject, NUL-separated.
  const batchKey = (r: { courseId: string; teacherId: string; subjectSlug: string }) =>
    [r.courseId, r.teacherId, r.subjectSlug].join(String.fromCharCode(0));

  beforeEach(() => {
    vi.clearAllMocks();
    db = communityLearningFixture();
    mocks.admin.mockReturnValue({
      ...db.admin,
      rpc: () => ({ maybeSingle: async () => ({ data: {}, error: null }) }),
    });
    mocks.attempts.mockResolvedValue([]);
    mocks.ensure.mockResolvedValue([]);
    mocks.history.mockResolvedValue({ challenges: [], page: 1, total: 0, totalPages: 0 });
    const topics = [
      { topic_key: "ohms-law", title: "Ohm's law", unit_number: "1", position: 0, blurb: "" },
      { topic_key: "kvl", title: "Kirchhoff's voltage law", unit_number: "1", position: 1, blurb: "" },
      { topic_key: "kcl", title: "Kirchhoff's current law", unit_number: "1", position: 2, blurb: "" },
    ];
    mocks.learningTopicsBatch.mockImplementation(async (requests) => {
      const map = new Map();
      for (const r of requests) map.set(batchKey(r), topics);
      return map;
    });
    mocks.communities.mockResolvedValue([
      subject("basic_electrical", "Basic Electrical Engineering", SEM_1),
    ]);
    mocks.communityScope.mockResolvedValue({
      communityId: "community-1",
      communitySlug: "bct",
      communityName: "BCT",
      courseId: "course-1",
      currentTermId: "term-1",
    });
  });

  it("does not fill for a practice set on a topic", async () => {
    // Mastery is written by every graded activity. Two topics touched by a
    // practice set or an MCQ check are "practised" — and not completed
    // challenges, which is what the bar says it counts.
    mocks.mastery.mockResolvedValue([
      { courseId: "course-1", subjectSlug: "basic_electrical", topicKey: "ohms-law", attempts: 2, percentage: 70, status: "developing" },
      { courseId: "course-1", subjectSlug: "basic_electrical", topicKey: "kvl", attempts: 1, percentage: 40, status: "weak" },
    ]);
    db.tables.student_challenges = [];

    const [subjectRow] = (await getStudentChallengeDashboard("member")).subjects;

    expect(subjectRow.practicedTopics).toBe(2);
    expect(subjectRow.completedTopics).toBe(0);
  });

  it("counts each completed subtopic once, and nothing still open", async () => {
    mocks.mastery.mockResolvedValue([]);
    db.tables.student_challenges = [
      { user_id: "member", course_id: "course-1", subject_slug: "basic_electrical", topic_key: "ohms-law", status: "completed" },
      // Completed twice: one subtopic, not two.
      { user_id: "member", course_id: "course-1", subject_slug: "basic_electrical", topic_key: "ohms-law", status: "completed" },
      { user_id: "member", course_id: "course-1", subject_slug: "basic_electrical", topic_key: "kvl", status: "completed" },
      // Opened and left: not completed.
      { user_id: "member", course_id: "course-1", subject_slug: "basic_electrical", topic_key: "kcl", status: "started" },
      // Another student entirely.
      { user_id: "someone-else", course_id: "course-1", subject_slug: "basic_electrical", topic_key: "kcl", status: "completed" },
    ];

    const [subjectRow] = (await getStudentChallengeDashboard("member")).subjects;

    expect(subjectRow.completedTopics).toBe(2);
    expect(subjectRow.totalTopics).toBe(3);
  });

  it("ignores a completed challenge on a topic the catalogue no longer lists", async () => {
    // A unit since re-read into its bullets is not one of these subtopics, and
    // counting it would push the bar past everything that exists.
    mocks.mastery.mockResolvedValue([]);
    db.tables.student_challenges = [
      { user_id: "member", course_id: "course-1", subject_slug: "basic_electrical", topic_key: "dc-circuits-unit", status: "completed" },
    ];

    const [subjectRow] = (await getStudentChallengeDashboard("member")).subjects;

    expect(subjectRow.completedTopics).toBe(0);
  });
});
