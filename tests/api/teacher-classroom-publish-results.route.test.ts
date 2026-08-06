import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTeacherProfile: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  recordTeacherClassroomActivity: vi.fn(),
}));

vi.mock("@/app/teachers/actions", () => ({ getTeacherProfile: mocks.getTeacherProfile }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/teacher-classroom-activity", () => ({
  recordTeacherClassroomActivity: mocks.recordTeacherClassroomActivity,
}));

import { POST } from "@/app/api/teacher/classrooms/[classroomId]/submissions/publish/route";

describe("POST /api/teacher/classrooms/:classroomId/submissions/publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTeacherProfile.mockResolvedValue({ id: "teacher-1" });
    mocks.recordTeacherClassroomActivity.mockResolvedValue(undefined);
  });

  it("publishes only waiting results owned by the classroom teacher", async () => {
    const update = vi.fn();
    const updateFirstEq = vi.fn();
    const updateSecondEq = vi.fn(async () => ({ error: null }));
    updateFirstEq.mockReturnValue({ eq: updateSecondEq });
    update.mockReturnValue({ eq: updateFirstEq });

    const classroomQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: { id: "room-1", teacher_id: "teacher-1" },
        error: null,
      })),
    };
    classroomQuery.select.mockReturnValue(classroomQuery);
    classroomQuery.eq.mockReturnValue(classroomQuery);
    classroomQuery.is.mockReturnValue(classroomQuery);

    const assignmentQuery = {
      select: vi.fn(),
      eq: vi.fn(async () => ({ data: [{ id: "assignment-1" }], error: null })),
    };
    assignmentQuery.select.mockReturnValue(assignmentQuery);

    const submissionReadQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(async () => ({
        data: [
          { id: "submission-1", grade: { total_score: 7, total_marks: 10 } },
          {
            id: "submission-2",
            grade: {
              total_score: 9,
              total_marks: 10,
              _review: { status: "published" },
            },
          },
        ],
        error: null,
      })),
    };
    submissionReadQuery.select.mockReturnValue(submissionReadQuery);
    submissionReadQuery.eq.mockReturnValue(submissionReadQuery);

    let submissionCall = 0;
    const from = vi.fn((table: string) => {
      if (table === "teacher_classrooms") return classroomQuery;
      if (table === "teacher_exam_assignments") return assignmentQuery;
      if (table === "teacher_exam_submissions") {
        submissionCall += 1;
        return submissionCall === 1 ? submissionReadQuery : { update };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from });

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ classroomId: "room-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ published: 1 });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        grade: expect.objectContaining({
          _review: expect.objectContaining({ status: "published" }),
        }),
      }),
    );
    expect(updateSecondEq).toHaveBeenCalledWith("teacher_id", "teacher-1");
    expect(mocks.recordTeacherClassroomActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ classroomId: "room-1", eventType: "results.published" }),
    );
  });

  it("refuses a helper teacher", async () => {
    const classroomQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: { id: "room-1", teacher_id: "teacher-owner" },
        error: null,
      })),
    };
    classroomQuery.select.mockReturnValue(classroomQuery);
    classroomQuery.eq.mockReturnValue(classroomQuery);
    classroomQuery.is.mockReturnValue(classroomQuery);
    const helperQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: { role: "helper" }, error: null })),
    };
    helperQuery.select.mockReturnValue(helperQuery);
    helperQuery.eq.mockReturnValue(helperQuery);
    const from = vi.fn((table: string) =>
      table === "teacher_classrooms" ? classroomQuery : helperQuery,
    );
    mocks.createSupabaseAdminClient.mockReturnValue({ from });

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ classroomId: "room-1" }),
    });

    expect(response.status).toBe(403);
    expect(mocks.recordTeacherClassroomActivity).not.toHaveBeenCalled();
  });
});
