import { beforeEach, describe, expect, it, vi } from "vitest";
import { communityLearningFixture } from "../helpers/learning-database";

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  subjects: vi.fn(),
  ask: vi.fn(),
  topics: vi.fn(),
  admin: vi.fn(),
  challenges: vi.fn(),
  revalidate: vi.fn(),
  mastery: vi.fn(),
  attempts: vi.fn(),
}));
vi.mock("@/app/teachers/actions", () => ({ getTeacherProfile: mocks.profile }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/lib/teacher-app/client", async (original) => ({
  ...(await original<typeof import("@/lib/teacher-app/client")>()),
  getTeacherSubjects: mocks.subjects,
  askTeacherSubject: mocks.ask,
  getTeacherPracticeTopics: mocks.topics,
}));
vi.mock("@/lib/data/student-challenges", () => ({ ensureDailyChallenges: mocks.challenges }));
vi.mock("@/lib/data/student-mastery", () => ({
  listTopicMastery: mocks.mastery,
  listPracticeAttempts: mocks.attempts,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { GET, POST, PUT } from "@/app/api/teacher/subjects/[slug]/syllabus/route";
import { getCommunitySubjectExplorerInsights } from "@/lib/data/community-subject-explorer";
import { readCourseLearningTopics } from "@/lib/data/community-learning-topics";
import type { CommunityDetail } from "@/lib/communities";

const structure = [{ title: "Tokens", topics: [{ name: "Identifiers" }, { name: "Operators" }] }];
const context = () => ({ params: Promise.resolve({ slug: "teacher_nims" }) });
const request = (method: string, body?: unknown) =>
  new Request("http://localhost/api/teacher/subjects/teacher_nims/syllabus", {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
      : {}),
  });

describe("syllabus extraction → publication → student catalogue", () => {
  let db: ReturnType<typeof communityLearningFixture>;
  beforeEach(() => {
    vi.clearAllMocks();
    db = communityLearningFixture();
    mocks.admin.mockReturnValue(db.admin);
    mocks.profile.mockResolvedValue({
      id: "teacher-1",
      user_id: "owner",
      collection_sk: "collection",
    });
    mocks.subjects.mockResolvedValue({ subjects: [{ slug: "teacher_nims", name: "Nims" }] });
    mocks.ask.mockResolvedValue({ answer: JSON.stringify(structure) });
    mocks.topics.mockResolvedValue({
      topics: [
        { topic_key: "provider-identifiers", title: "Identifiers" },
        { topic_key: "provider-operators", title: "Operators" },
      ],
    });
    mocks.challenges.mockResolvedValue([]);
    mocks.mastery.mockResolvedValue([]);
    mocks.attempts.mockResolvedValue([]);
  });

  it.each(["POST", "PUT"])(
    "%s publishes saved topics and makes the same list visible to students",
    async (method) => {
      const response =
        method === "POST"
          ? await POST(request(method), context())
          : await PUT(request(method, structure), context());
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        structure,
        sync: { subjectsSynced: 1, topicCount: 2 },
      });
      expect(db.tables.community_subject_topics.map((row) => row.title)).toEqual([
        "Identifiers",
        "Operators",
      ]);
      expect(db.tables.community_subjects[0].topic_sync_status).toBe("ready");
      expect(mocks.topics).toHaveBeenCalledWith("collection", "Nims", { refresh: true });
      expect(mocks.challenges).toHaveBeenCalledExactlyOnceWith(
        "member",
        expect.arrayContaining([
          expect.objectContaining({
            courseId: "course-1",
            subjectSlug: "teacher_nims",
            topicTitle: "Identifiers",
          }),
        ]),
        { minimumRecommendationCount: 3 },
      );

      const community = {
        studyCourseId: "course-1",
        terms: [
          {
            subjects: [
              {
                id: "subject-1",
                teacherId: "teacher-1",
                externalSubjectSlug: "teacher_nims",
                name: "Nims",
                folderPath: "Nims",
                slug: "nims",
              },
            ],
          },
        ],
      } as CommunityDetail;
      const insights = await getCommunitySubjectExplorerInsights("member", community);
      expect(insights["subject-1"].topicCount).toBe(2);
      const catalogue = await readCourseLearningTopics(
        "course-1",
        "teacher-1",
        "teacher_nims",
        db.admin,
      );
      expect(catalogue?.map((row) => row.topic_key)).toEqual(
        insights["subject-1"].topics.map((row) => row.key),
      );
      expect(mocks.revalidate).toHaveBeenCalledWith("/app", "layout");
    },
  );

  it("makes old extracted syllabi visible without another extraction or database writes", async () => {
    db.tables.teacher_subject_syllabi.push({
      teacher_id: "teacher-1",
      subject_slug: "teacher_nims",
      structure,
    });
    expect(
      await readCourseLearningTopics("course-1", "teacher-1", "teacher_nims", db.admin),
    ).toHaveLength(2);
    expect(db.tables.community_subject_topics).toEqual([]);
    expect(mocks.ask).not.toHaveBeenCalled();
    expect(mocks.topics).toHaveBeenCalledExactlyOnceWith("collection", "Nims");
  });

  it("keeps existing topic keys, rows, and mastery intact on repeat saves/reordering", async () => {
    db.tables.community_subject_topics.push({
      id: "original",
      community_subject_id: "subject-1",
      topic_key: "provider-identifiers",
      title: "Identifiers",
      unit_number: "1",
    });
    await PUT(request("PUT", structure), context());
    const first = db.tables.community_subject_topics.map((row) => ({ ...row }));
    await PUT(
      request("PUT", [{ title: "Tokens", topics: [...structure[0].topics].reverse() }]),
      context(),
    );
    expect(db.tables.community_subject_topics).toHaveLength(2);
    for (const row of first)
      expect(db.tables.community_subject_topics).toContainEqual(
        expect.objectContaining({ id: row.id, topic_key: row.topic_key }),
      );
    expect(db.from).not.toHaveBeenCalledWith("student_topic_mastery");
  });

  it("returns an honest partial-save error if publication fails, and retry repairs it", async () => {
    db.failures.set("community_subject_topics:upsert", "Write failed");
    const response = await PUT(request("PUT", structure), context());
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("syllabus was saved");
    expect(db.tables.teacher_subject_syllabi).toHaveLength(1);
    expect(db.tables.community_subjects[0].topic_sync_status).toBe("error");
    db.failures.clear();
    expect((await PUT(request("PUT", structure), context())).status).toBe(200);
    expect(db.tables.community_subject_topics).toHaveLength(2);
  });

  it("saves private subjects without publishing to another owner's community", async () => {
    db.tables.communities[0].creator_id = "someone-else";
    expect((await PUT(request("PUT", structure), context())).status).toBe(200);
    expect(db.tables.community_subject_topics).toEqual([]);
    expect(mocks.challenges).not.toHaveBeenCalled();
  });

  it("does not claim a complete extraction if the challenge graph is empty", async () => {
    mocks.topics.mockResolvedValue({ topics: [] });
    const response = await POST(request("POST"), context());
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("syllabus was saved");
    expect(db.tables.community_subjects[0].topic_sync_status).toBe("empty");
    expect(mocks.challenges).not.toHaveBeenCalled();
  });

  it("does not publish into deleted communities or inactive subject links", async () => {
    db.tables.communities[0].status = "deleted";
    expect((await PUT(request("PUT", structure), context())).status).toBe(200);
    expect(db.tables.community_subject_topics).toEqual([]);
    db.tables.communities[0].status = "active";
    db.tables.community_subjects[0].status = "deleted";
    expect((await PUT(request("PUT", structure), context())).status).toBe(200);
    expect(db.tables.community_subject_topics).toEqual([]);
  });

  it("does not save or sync a subject outside the authenticated teacher collection", async () => {
    mocks.subjects.mockResolvedValue({ subjects: [] });
    expect((await PUT(request("PUT", structure), context())).status).toBe(404);
    expect(db.tables.teacher_subject_syllabi).toEqual([]);
    expect(mocks.ask).not.toHaveBeenCalled();
  });

  it("requires authentication, rejects empty structure, and leaves GET read-only", async () => {
    mocks.profile.mockResolvedValue(null);
    expect((await POST(request("POST"), context())).status).toBe(401);
    mocks.profile.mockResolvedValue({
      id: "teacher-1",
      user_id: "owner",
      collection_sk: "collection",
    });
    expect((await PUT(request("PUT", []), context())).status).toBe(400);
    expect((await GET(request("GET"), context())).status).toBe(200);
    expect(db.tables.teacher_subject_syllabi).toEqual([]);
    expect(mocks.challenges).not.toHaveBeenCalled();
  });
});
