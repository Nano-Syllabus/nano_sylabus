import { describe, expect, it } from "vitest";
import { listPublicCommunities } from "@/lib/data/communities";
import {
  getStudentCommunityLearningScope,
  listStudentCommunitySubjectAccess,
} from "@/lib/student-courses";
import { learningDatabase } from "@/tests/helpers/learning-database";

describe("community subject publication access", () => {
  it("counts active members separately from published subjects in community summaries", async () => {
    const { admin } = learningDatabase({
      communities: [
        {
          id: "community-1",
          creator_id: "owner-1",
          slug: "coding",
          name: "Coding",
          status: "active",
          visibility: "public",
          created_at: "2026-09-06T00:00:00.000Z",
        },
      ],
      community_memberships: [
        {
          community_id: "community-1",
          user_id: "member-1",
          role: "member",
          status: "active",
        },
      ],
      community_subjects: [
        {
          community_id: "community-1",
          status: "active",
          publication_status: "published",
        },
        { community_id: "community-1", status: "active", publication_status: "draft" },
      ],
    });

    const [community] = await listPublicCommunities(null, admin);

    expect(community.memberCount).toBe(1);
    expect(community.subjectCount).toBe(1);
  });

  it("returns published subjects to members and keeps drafts out of student access", async () => {
    const { admin } = learningDatabase({
      community_memberships: [
        {
          community_id: "community-1",
          user_id: "member-1",
          role: "member",
          status: "active",
        },
        {
          community_id: "community-2",
          user_id: "member-1",
          role: "creator",
          status: "active",
        },
      ],
      communities: [
        {
          id: "community-1",
          slug: "coding",
          name: "Coding",
          status: "active",
          study_course_id: "course-1",
        },
        {
          id: "community-2",
          slug: "my-community",
          name: "My Community",
          status: "active",
          study_course_id: "course-2",
        },
      ],
      community_subjects: [
        {
          id: "published-subject",
          community_id: "community-1",
          term_id: "term-1",
          teacher_id: "teacher-1",
          external_subject_slug: "teacher_c_programming",
          name: "C Programming",
          folder_path: "C Programming",
          status: "active",
          publication_status: "published",
        },
        {
          id: "draft-subject",
          community_id: "community-1",
          term_id: "term-1",
          teacher_id: "teacher-1",
          external_subject_slug: "teacher_hidden_draft",
          name: "Hidden Draft",
          folder_path: "Hidden Draft",
          status: "active",
          publication_status: "draft",
        },
        {
          id: "owned-subject",
          community_id: "community-2",
          term_id: "term-2",
          teacher_id: "teacher-1",
          external_subject_slug: "teacher_owned_subject",
          name: "Owned Subject",
          folder_path: "Owned Subject",
          status: "active",
          publication_status: "published",
        },
      ],
      community_terms: [
        {
          id: "term-1",
          year_number: 1,
          semester_number: 1,
          semester_in_year: 1,
          position: 1,
        },
        {
          id: "term-2",
          year_number: 1,
          semester_number: 1,
          semester_in_year: 1,
          position: 1,
        },
      ],
    });

    const [access, scope, ownedScope] = await Promise.all([
      listStudentCommunitySubjectAccess("member-1", admin),
      getStudentCommunityLearningScope("member-1", admin),
      getStudentCommunityLearningScope("member-1", admin, { communitySlug: "my-community" }),
    ]);

    expect(access).toHaveLength(2);
    expect(access).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subjectSlug: "teacher_c_programming",
          subjectName: "C Programming",
          accessKind: "community",
        }),
        expect.objectContaining({
          subjectSlug: "teacher_owned_subject",
          subjectName: "Owned Subject",
          accessKind: "community",
        }),
      ]),
    );
    expect(scope).toEqual({
      communityId: "community-1",
      communitySlug: "coding",
      communityName: "Coding",
      courseId: "course-1",
    });
    expect(ownedScope).toEqual({
      communityId: "community-2",
      communitySlug: "my-community",
      communityName: "My Community",
      courseId: "course-2",
    });
  });
});
