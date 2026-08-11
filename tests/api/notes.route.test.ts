import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, revisionNoteUpsert } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  revisionNoteUpsert: vi.fn(),
}));

const { getStudentCourseSubjectAccessForCourse } = vi.hoisted(() => ({
  getStudentCourseSubjectAccessForCourse: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
}));

vi.mock("@/lib/student-courses", () => ({
  getStudentCourseSubjectAccessForCourse,
}));

import { POST } from "@/app/api/notes/route";

describe("POST /api/notes", () => {
  beforeEach(() => {
    getStudentCourseSubjectAccessForCourse.mockResolvedValue({
      courseId: "33333333-3333-3333-3333-333333333333",
      teacherId: "teacher-1",
      subjectSlug: "biology",
      subjectName: "Biology",
      folderPath: "biology",
    });

    const sessionChain = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: { id: "session-1" } })),
    };
    sessionChain.select.mockReturnValue(sessionChain);
    sessionChain.eq.mockReturnValue(sessionChain);

    const messageChain = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: { id: "message-1", role: "assistant" } })),
    };
    messageChain.select.mockReturnValue(messageChain);
    messageChain.eq.mockReturnValue(messageChain);

    const subscriptionChain = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: null,
        error: null,
      })),
    };
    subscriptionChain.select.mockReturnValue(subscriptionChain);
    subscriptionChain.eq.mockReturnValue(subscriptionChain);
    subscriptionChain.order.mockReturnValue(subscriptionChain);
    subscriptionChain.limit.mockReturnValue(subscriptionChain);

    const existingNoteChain = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    existingNoteChain.select.mockReturnValue(existingNoteChain);
    existingNoteChain.eq.mockReturnValue(existingNoteChain);

    const countChain = {
      select: vi.fn(),
      eq: vi.fn(async () => ({ count: 0, error: null })),
    };
    countChain.select.mockReturnValue(countChain);

    const single = vi.fn(async () => ({ data: { id: "note-1" }, error: null }));
    const select = vi.fn(() => ({ single }));
    revisionNoteUpsert.mockImplementation(() => ({ select }));
    const revisionNotesTable = { upsert: revisionNoteUpsert };
    let revisionNotesReadCount = 0;

    createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "chat_sessions") return sessionChain;
        if (table === "chat_messages") return messageChain;
        if (table === "user_subscriptions") return subscriptionChain;
        if (table === "revision_notes") {
          revisionNotesReadCount += 1;
          if (revisionNotesReadCount === 1) return existingNoteChain;
          if (revisionNotesReadCount === 2) return countChain;
          return revisionNotesTable;
        }
        throw new Error(`Unexpected table access: ${table}`);
      }),
    });
  });

  it("saves a note from an assistant message in the user's own session", async () => {
    const response = await POST(
      new Request("http://localhost/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "11111111-1111-1111-1111-111111111111",
          messageId: "22222222-2222-2222-2222-222222222222",
          title: "Photosynthesis basics",
          courseId: "33333333-3333-3333-3333-333333333333",
          subjectSlug: "biology",
          chapterTag: "Plant Physiology",
          annotation: "Revise before exam",
          colorLabel: "yellow",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: "note-1" });
    expect(revisionNoteUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        course_id: "33333333-3333-3333-3333-333333333333",
        subject_slug: "biology",
        subject_name: "Biology",
        subject_tag: "Biology",
      }),
      { onConflict: "user_id,message_id" },
    );
  });

  it("blocks new note save when free-plan note limit is reached", async () => {
    const sessionChain = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: { id: "session-1" } })),
    };
    sessionChain.select.mockReturnValue(sessionChain);
    sessionChain.eq.mockReturnValue(sessionChain);

    const messageChain = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: { id: "message-1", role: "assistant" } })),
    };
    messageChain.select.mockReturnValue(messageChain);
    messageChain.eq.mockReturnValue(messageChain);

    const subscriptionChain = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    subscriptionChain.select.mockReturnValue(subscriptionChain);
    subscriptionChain.eq.mockReturnValue(subscriptionChain);
    subscriptionChain.order.mockReturnValue(subscriptionChain);
    subscriptionChain.limit.mockReturnValue(subscriptionChain);

    const existingNoteChain = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    existingNoteChain.select.mockReturnValue(existingNoteChain);
    existingNoteChain.eq.mockReturnValue(existingNoteChain);

    const countChain = {
      select: vi.fn(),
      eq: vi.fn(async () => ({ count: 50, error: null })),
    };
    countChain.select.mockReturnValue(countChain);

    const revisionNotesTable = {
      upsert: vi.fn(),
    };
    let revisionNotesReadCount = 0;

    createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "chat_sessions") return sessionChain;
        if (table === "chat_messages") return messageChain;
        if (table === "user_subscriptions") return subscriptionChain;
        if (table === "revision_notes") {
          revisionNotesReadCount += 1;
          if (revisionNotesReadCount === 1) return existingNoteChain;
          if (revisionNotesReadCount === 2) return countChain;
          return revisionNotesTable;
        }
        throw new Error(`Unexpected table access: ${table}`);
      }),
    });

    const response = await POST(
      new Request("http://localhost/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "11111111-1111-1111-1111-111111111111",
          messageId: "22222222-2222-2222-2222-222222222222",
          title: "Photosynthesis basics",
          courseId: "33333333-3333-3333-3333-333333333333",
          subjectSlug: "biology",
          chapterTag: "Plant Physiology",
          annotation: "Revise before exam",
          colorLabel: "yellow",
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "You have reached your note limit (50) for the free plan.",
      code: "NOTE_LIMIT_REACHED",
    });
  });
});
