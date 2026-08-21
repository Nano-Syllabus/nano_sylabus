import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  askTeacherSubject,
  askTeacherSubjectStream,
  chatTenantStream,
  createSupabaseAdminClient,
  createSupabaseServerClient,
  ensureStarterCreditsForUser,
  getCreditBalanceForUser,
  hasUnlimitedSubscription,
  getStudentCourseSubjectAccess,
  getStudentCourseSubjectAccessForCourse,
  getTenantName,
} = vi.hoisted(() => ({
  askTeacherSubject: vi.fn(),
  askTeacherSubjectStream: vi.fn(),
  chatTenantStream: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  ensureStarterCreditsForUser: vi.fn(),
  getCreditBalanceForUser: vi.fn(),
  hasUnlimitedSubscription: vi.fn(),
  getStudentCourseSubjectAccess: vi.fn(),
  getStudentCourseSubjectAccessForCourse: vi.fn(),
  getTenantName: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
}));

vi.mock("@/lib/data/billing", () => ({
  ensureStarterCreditsForUser,
  getCreditBalanceForUser,
  hasUnlimitedSubscription,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient,
}));

vi.mock("@/lib/student-courses", () => ({
  getStudentCourseSubjectAccess,
  getStudentCourseSubjectAccessForCourse,
}));

vi.mock("@/lib/tenant/client", () => ({
  chatTenantStream,
  getTenantName,
}));

vi.mock("@/lib/teacher-app/client", () => ({
  askTeacherSubject,
  askTeacherSubjectStream,
  TeacherApiError: class TeacherApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
}));

import { POST } from "@/app/api/chat/route";

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasUnlimitedSubscription.mockResolvedValue(false);

    const profileChain = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: {
          user_id: "user-1",
          full_name: "Student",
          college: "Campus",
          grade: "11",
          board_score: null,
          subjects: ["Physics"],
          target_grade: "A",
          language_pref: "EN",
          created_at: "2026-04-20T00:00:00.000Z",
          updated_at: "2026-04-20T00:00:00.000Z",
        },
      })),
    };
    profileChain.select.mockReturnValue(profileChain);
    profileChain.eq.mockReturnValue(profileChain);

    createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: "user-1",
              email: "student@example.com",
            },
          },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "student_profiles") return profileChain;
        throw new Error(`Unexpected table access: ${table}`);
      }),
    });

    ensureStarterCreditsForUser.mockResolvedValue(0);
    getCreditBalanceForUser.mockResolvedValue(0);
    getStudentCourseSubjectAccess.mockResolvedValue(null);
    getStudentCourseSubjectAccessForCourse.mockResolvedValue(null);
    getTenantName.mockResolvedValue("nano-syllabus");
  });

  it("blocks chat when the user has no credits left", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: null,
          language: "EN",
          messages: [{ role: "user", content: "Explain photosynthesis" }],
        }),
      }),
    );

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toEqual({
      error: "No credits left. Buy a plan to continue chatting.",
    });
  });

  it("accepts the owner-only private subject id format before authorization", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: null,
          language: "EN",
          tenantSubject: {
            courseId: "private:11111111-1111-4111-8111-111111111111",
            name: "Private subject",
            slug: "private-subject",
            namespaceSlug: "private-subject",
            folderPath: "Private subject",
          },
          messages: [{ role: "user", content: "Explain this subject" }],
        }),
      }),
    );

    // The request reaches the normal credit/authorization flow instead of
    // failing schema validation with an "Invalid uuid" error.
    expect(response.status).toBe(402);
  });

  it("answers a private subject through its owner collection stream instead of the published stream", async () => {
    ensureStarterCreditsForUser.mockResolvedValue(10);
    getCreditBalanceForUser.mockResolvedValue(10);
    getStudentCourseSubjectAccessForCourse.mockResolvedValue({
      courseId: "private:11111111-1111-4111-8111-111111111111",
      teacherId: "teacher-1",
      subjectSlug: "opt-math",
      subjectName: "OPT MATH",
      folderPath: "OPT MATH",
      accessKind: "owner-private",
    });
    askTeacherSubjectStream.mockImplementation(async (...args: unknown[]) => {
      const onEvent = args[6] as (event: unknown) => void | Promise<void>;
      await onEvent({
        type: "token",
        text: "You can learn algebra and geometry from these materials.",
      });
      await onEvent({
        type: "sources",
        chunks: [
          {
            score: 0.9,
            text: "Algebra and geometry",
            source: { filename: "opt-math.pdf", page: 2 },
          },
        ],
        chunks_retrieved: 1,
        served_from: "owner_private_collection",
        next_topic: "Quadratic equations",
      });
      await onEvent({ type: "done", ok: true });
    });

    const query = (result: { data?: unknown; error?: unknown } = { data: null, error: null }) => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        update: vi.fn(() => builder),
        insert: vi.fn(() => builder),
        single: vi.fn(async () => result),
        maybeSingle: vi.fn(async () => result),
        then: (
          resolve: (value: { data?: unknown; error?: unknown }) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => Promise.resolve(result).then(resolve, reject),
      };
      return builder;
    };
    const sessionQuery = query({
      data: { id: "session-1", subject_context: "OPT MATH" },
      error: null,
    });
    let messageNumber = 0;
    createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "student_profiles") {
          return query({
            data: {
              user_id: "user-1",
              full_name: "Student",
              college: "Campus",
              grade: "11",
              board_score: null,
              subjects: ["OPT MATH"],
              target_grade: "A",
            },
            error: null,
          });
        }
        if (table === "chat_sessions") return sessionQuery;
        if (table === "chat_messages") {
          messageNumber += 1;
          return query({ data: { id: `message-${messageNumber}` }, error: null });
        }
        if (table === "credits_ledger") return query();
        throw new Error(`Unexpected table access: ${table}`);
      }),
    });
    createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => {
        const builder = query({
          data: { handle: "student-teacher", collection_sk: "collection-secret" },
          error: null,
        });
        return builder;
      }),
    });

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: null,
          language: "EN",
          subjectContext: "OPT MATH",
          tenantSubject: {
            courseId: "private:11111111-1111-4111-8111-111111111111",
            name: "OPT MATH",
            slug: "opt-math",
            namespaceSlug: "opt-math",
            folderPath: "OPT MATH",
          },
          messages: [{ role: "user", content: "What can I learn?" }],
        }),
      }),
    );
    const stream = await response.text();

    expect(response.status).toBe(200);
    expect(stream).toContain("You can learn algebra and geometry");
    expect(stream).toContain("Quadratic equations");
    expect(stream).toContain("owner_private_collection");
    expect(askTeacherSubjectStream).toHaveBeenCalledWith(
      "collection-secret",
      "OPT MATH",
      "What can I learn?",
      8,
      expect.stringContaining("Teach the subject: OPT MATH"),
      [],
      expect.any(Function),
    );
    expect(askTeacherSubject).not.toHaveBeenCalled();
    expect(chatTenantStream).not.toHaveBeenCalled();
    expect(getTenantName).not.toHaveBeenCalled();
  });

  it("falls back to owner private subject access when client metadata is missing", async () => {
    ensureStarterCreditsForUser.mockResolvedValue(10);
    getCreditBalanceForUser.mockResolvedValue(10);
    getStudentCourseSubjectAccess.mockResolvedValue({
      courseId: "private:11111111-1111-4111-8111-111111111111",
      teacherId: "teacher-1",
      subjectSlug: "opt-math",
      subjectName: "OPT MATH",
      folderPath: "OPT MATH",
      accessKind: "owner-private",
    });
    askTeacherSubjectStream.mockImplementation(async (...args: unknown[]) => {
      const onEvent = args[6] as (event: unknown) => void | Promise<void>;
      await onEvent({
        type: "token",
        text: "This private subject covers optional mathematics topics.",
      });
      await onEvent({
        type: "sources",
        chunks: [],
        served_from: "owner_private_collection",
        next_topic: "more practice problems",
      });
      await onEvent({ type: "done", ok: true });
    });

    const query = (result: { data?: unknown; error?: unknown } = { data: null, error: null }) => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        update: vi.fn(() => builder),
        insert: vi.fn(() => builder),
        single: vi.fn(async () => result),
        maybeSingle: vi.fn(async () => result),
        then: (
          resolve: (value: { data?: unknown; error?: unknown }) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => Promise.resolve(result).then(resolve, reject),
      };
      return builder;
    };
    let messageNumber = 0;
    createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "student_profiles") {
          return query({
            data: {
              user_id: "user-1",
              full_name: "Student",
              college: "Campus",
              grade: "11",
              board_score: null,
              subjects: ["OPT MATH"],
              target_grade: "A",
            },
            error: null,
          });
        }
        if (table === "chat_sessions") {
          return query({
            data: { id: "session-1", subject_context: "OPT MATH" },
            error: null,
          });
        }
        if (table === "chat_messages") {
          messageNumber += 1;
          return query({ data: { id: `message-${messageNumber}` }, error: null });
        }
        if (table === "credits_ledger") return query();
        throw new Error(`Unexpected table access: ${table}`);
      }),
    });
    createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() =>
        query({
          data: { handle: "student-teacher", collection_sk: "collection-secret" },
          error: null,
        }),
      ),
    });

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: null,
          language: "EN",
          subjectContext: "OPT MATH",
          messages: [{ role: "user", content: "What can I learn?" }],
        }),
      }),
    );
    const stream = await response.text();

    expect(response.status).toBe(200);
    expect(stream).toContain("This private subject covers optional mathematics");
    expect(stream).toContain("more practice problems");
    expect(getStudentCourseSubjectAccess).toHaveBeenCalledWith("user-1", "OPT MATH");
    expect(askTeacherSubjectStream).toHaveBeenCalled();
    expect(askTeacherSubject).not.toHaveBeenCalled();
    expect(chatTenantStream).not.toHaveBeenCalled();
    expect(getTenantName).not.toHaveBeenCalled();
  });
});
