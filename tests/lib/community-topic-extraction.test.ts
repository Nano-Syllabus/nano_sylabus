import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({ topics: vi.fn(), challenges: vi.fn() }));
vi.mock("@/lib/teacher-app/client", () => ({ getTeacherPracticeTopics: mocks.topics }));
vi.mock("@/lib/data/student-challenges", () => ({ ensureDailyChallenges: mocks.challenges }));
import { syncCommunitySubjectTopics } from "@/lib/data/community-subjects";

function query(data: unknown) {
  const result = { data, error: null as Error | null };
  const chain = {
    select: vi.fn(), eq: vi.fn(), limit: vi.fn(), in: vi.fn(),
    update: vi.fn(), upsert: vi.fn(), delete: vi.fn(),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const method of [chain.select, chain.eq, chain.limit, chain.in, chain.update, chain.upsert, chain.delete]) {
    method.mockReturnValue(chain);
  }
  return { chain, result };
}

function fixture() {
  const tables = {
    community_subjects: query({ id: "subject-1", community_id: "community-1", name: "Nims", external_subject_slug: "teacher_nims", teacher_id: "teacher-1" }),
    communities: query({ id: "community-1", slug: "henglish", creator_id: "owner", study_course_id: "course-1" }),
    teachers: query({ collection_sk: "subject-collection", handle: "creator-handle" }),
    teacher_subject_syllabi: query(null),
    community_subject_topics: query([]),
    community_memberships: query([{ user_id: "member-1" }, { user_id: "member-2" }]),
  };
  const admin = { from: vi.fn((name: keyof typeof tables) => tables[name].chain) } as unknown as SupabaseClient;
  return { admin, tables };
}

describe("community challenge topic extraction", () => {
  beforeEach(() => {
    mocks.topics.mockResolvedValue({ topics: [{ topic_key: "grammar", title: "Grammar", blurb: "Sentence structure", unit_number: "1" }] });
    mocks.challenges.mockResolvedValue([]);
  });

  it("refreshes the correct collection, saves shared topics, and assigns challenges to active members", async () => {
    const { admin, tables } = fixture();
    const result = await syncCommunitySubjectTopics("owner", "henglish", "subject-1", admin);
    expect(mocks.topics).toHaveBeenCalledExactlyOnceWith("subject-collection", "Nims", { refresh: true });
    expect(tables.community_subject_topics.chain.upsert).toHaveBeenCalledWith([
      expect.objectContaining({ community_subject_id: "subject-1", topic_key: "grammar", title: "Grammar" }),
    ], { onConflict: "community_subject_id,topic_key" });
    expect(tables.community_subjects.chain.update).toHaveBeenCalledWith(expect.objectContaining({ topic_sync_status: "ready" }));
    expect(tables.community_subjects.chain.eq).toHaveBeenCalledWith("status", "active");
    expect(tables.communities.chain.eq).toHaveBeenCalledWith("slug", "henglish");
    expect(tables.communities.chain.eq).toHaveBeenCalledWith("status", "active");
    expect(tables.community_memberships.chain.eq).toHaveBeenCalledWith("community_id", "community-1");
    expect(tables.community_memberships.chain.eq).toHaveBeenCalledWith("status", "active");
    for (const userId of ["member-1", "member-2"]) {
      expect(mocks.challenges).toHaveBeenCalledWith(userId, [expect.objectContaining({
        courseId: "course-1", subjectSlug: "teacher_nims", topicKey: "grammar", namespace: "creator-handle",
      })], { minimumRecommendationCount: 3 });
    }
    expect(result.topicSyncStatus).toBe("ready");
  });

  it("publishes executable provider IDs even when the editable outline has different labels", async () => {
    const { admin, tables } = fixture();
    tables.teacher_subject_syllabi.result.data = {
      structure: [{ title: "Tokens", topics: [{ name: "Identifiers" }] }],
    };
    const result = await syncCommunitySubjectTopics("owner", "henglish", "subject-1", admin);
    expect(mocks.topics).toHaveBeenCalledWith("subject-collection", "Nims", { refresh: true });
    expect(result.topics).toEqual([expect.objectContaining({ topic_key: "grammar", title: "Grammar" })]);
    expect(mocks.challenges).toHaveBeenCalledWith("member-1", [expect.objectContaining({ topicKey: "grammar" })], expect.anything());
  });

  it("rejects another member before contacting extraction or writing data", async () => {
    const { admin, tables } = fixture();
    await expect(syncCommunitySubjectTopics("member-1", "henglish", "subject-1", admin)).rejects.toMatchObject({ status: 403 });
    expect(mocks.topics).not.toHaveBeenCalled();
    expect(tables.community_subjects.chain.update).not.toHaveBeenCalled();
  });

  it.each(["communities", "community_subjects"] as const)("rejects missing or deleted %s", async (table) => {
    const { admin, tables } = fixture();
    tables[table].result.data = null;
    await expect(syncCommunitySubjectTopics("owner", "henglish", "subject-1", admin)).rejects.toMatchObject({ status: 404 });
    expect(mocks.topics).not.toHaveBeenCalled();
  });

  it("reports an empty first extraction without pretending challenges are ready", async () => {
    const { admin, tables } = fixture();
    mocks.topics.mockResolvedValue({ topics: [] });
    const result = await syncCommunitySubjectTopics("owner", "henglish", "subject-1", admin);
    expect(result.topicSyncStatus).toBe("empty");
    expect(tables.community_subject_topics.chain.delete).not.toHaveBeenCalled();
    expect(mocks.challenges).not.toHaveBeenCalled();
  });

  it("keeps the existing learning map if a refresh returns no topics during indexing", async () => {
    const { admin, tables } = fixture();
    mocks.topics.mockResolvedValue({ topics: [] });
    tables.community_subject_topics.result.data = [{ id: "existing-topic" }];
    await expect(syncCommunitySubjectTopics("owner", "henglish", "subject-1", admin)).rejects.toMatchObject({ status: 422 });
    expect(tables.community_subject_topics.chain.delete).not.toHaveBeenCalled();
    expect(tables.community_subjects.chain.update).toHaveBeenCalledWith(expect.objectContaining({ topic_sync_status: "error" }));
  });

  it("does not interpret a malformed upstream response as an empty learning map", async () => {
    const { admin, tables } = fixture();
    mocks.topics.mockResolvedValue({ status: "pending" });
    await expect(syncCommunitySubjectTopics("owner", "henglish", "subject-1", admin)).rejects.toMatchObject({ status: 502 });
    expect(tables.community_subject_topics.chain.delete).not.toHaveBeenCalled();
    expect(mocks.challenges).not.toHaveBeenCalled();
  });

  it("does not report success if saving topics fails", async () => {
    const { admin, tables } = fixture();
    tables.community_subject_topics.result.error = new Error("Storage failed");
    await expect(syncCommunitySubjectTopics("owner", "henglish", "subject-1", admin)).rejects.toThrow("Storage failed");
    expect(mocks.challenges).not.toHaveBeenCalled();
    expect(tables.community_subjects.chain.update).toHaveBeenCalledWith(expect.objectContaining({ topic_sync_status: "error" }));
  });

  it("cleans up superseded topics only after a successful non-empty extraction", async () => {
    const { admin, tables } = fixture();
    tables.community_subject_topics.result.data = [{ id: "old", topic_key: "old" }, { id: "current", topic_key: "grammar" }];
    await syncCommunitySubjectTopics("owner", "henglish", "subject-1", admin);
    expect(tables.community_subject_topics.chain.in).toHaveBeenCalledWith("id", ["old"]);
  });
});
