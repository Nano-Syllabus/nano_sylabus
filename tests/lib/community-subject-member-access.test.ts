import { describe, expect, it, vi } from "vitest";
import { getCommunitySubjectWorkspace } from "@/lib/data/community-subjects";

function query(data: unknown) {
  const result = { data, error: null };
  const chain = {
    ...result,
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    neq: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(async () => result),
  };
  for (const fn of [chain.select, chain.eq, chain.in, chain.neq, chain.order]) fn.mockReturnValue(chain);
  return chain;
}

function fixture(membership: { status: string } | null) {
  const tables = {
    communities: query({
      id: "community-1",
      creator_id: "creator-1",
      study_course_id: "course-1",
      contribution_threshold: 3,
    }),
    community_memberships: query(membership),
    community_subjects: query({
      id: "subject-1",
      folder_path: "Physics",
      external_subject_slug: "teacher_physics",
      topic_sync_status: "ready",
    }),
    community_subject_topics: query([]),
    student_topic_mastery: query([]),
    community_posts: query([]),
    community_post_votes: query([]),
  };
  const admin = { from: vi.fn((table: keyof typeof tables) => tables[table]) };
  return { admin, tables };
}

describe("community subject member visibility", () => {
  it("allows members to open a linked subject regardless of base library privacy", async () => {
    const { admin, tables } = fixture({ status: "active" });
    await expect(
      getCommunitySubjectWorkspace("member-1", "engineering", "physics", admin as never),
    ).resolves.toMatchObject({
      subjectId: "subject-1",
      externalSubjectSlug: "teacher_physics",
      canManage: false,
    });
    expect(admin.from).not.toHaveBeenCalledWith("teacher_subject_profiles");
    expect(tables.community_memberships.eq).toHaveBeenCalledWith("user_id", "member-1");
    expect(tables.community_subjects.eq).toHaveBeenCalledWith("community_id", "community-1");
    expect(tables.community_subjects.eq).toHaveBeenCalledWith("status", "active");
    expect(tables.communities.eq).toHaveBeenCalledWith("status", "active");
  });

  it.each([null, { status: "left" }])(
    "denies subject details to an outsider or former member (%j)",
    async (membership) => {
      const { admin } = fixture(membership);
      await expect(
        getCommunitySubjectWorkspace("outsider", "engineering", "physics", admin as never),
      ).resolves.toBeNull();
      expect(admin.from).not.toHaveBeenCalledWith("community_subjects");
    },
  );
});
