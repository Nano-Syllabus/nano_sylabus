import { beforeEach, describe, expect, it, vi } from "vitest";
import { communityLearningFixture } from "../helpers/learning-database";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), access: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/lib/student-courses", () => ({
  getStudentCourseSubjectAccessForCourse: mocks.access,
  getStudentCourseSubjectAccess: mocks.access,
}));
vi.mock("@/lib/teacher-app/client", async (original) => ({
  ...(await original<typeof import("@/lib/teacher-app/client")>()),
  createTeacherChallenge: mocks.create,
}));
import { startStudentChallenge } from "@/lib/data/student-challenges";
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
    mocks.create.mockResolvedValue({
      can_start: true,
      topics: [{ topic_key: "provider-42", title: "Identifiers" }],
      reading: {
        headline: "Identifiers",
        content: "Source material",
        focus: "Identifiers",
        sources: [],
      },
      solved_questions: [],
      warnings: [],
      exam: {
        attempt_id: "exam-1",
        topics: [{ topic_key: "provider-42", title: "Identifiers" }],
        questions: [{ id: "q1", text: "Explain identifiers.", topic: "Identifiers", marks: 10 }],
        expires_at: "2099-01-01T00:00:00Z",
        total_marks: 10,
        pass_marks: 4,
        duration_minutes: 20,
      },
    });
  });

  it("opens the published provider topic and retains its ID for progress", async () => {
    const result = await startStudentChallenge("member", "challenge-1");
    expect(mocks.create).toHaveBeenCalledWith(
      "collection",
      expect.objectContaining({ topics: ["provider-42"] }),
    );
    expect(result?.topicKey).toBe("provider-42");
    expect(result?.content?.topicKeys).toEqual(["provider-42"]);
  });

  it("keeps the assignment intact when the provider is unavailable", async () => {
    mocks.create.mockRejectedValue(new TeacherApiError("Unavailable", 503));
    await expect(startStudentChallenge("member", "challenge-1")).rejects.toThrow();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(db.tables.student_challenges[0].status).toBe("assigned");
  });

  it("does not start a topic when its material cannot support an exam", async () => {
    const payload = await mocks.create();
    mocks.create.mockResolvedValue({ ...payload, can_start: false });
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
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
