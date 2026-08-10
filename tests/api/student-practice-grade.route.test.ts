import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  gradePracticeItems: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/tenant/client", () => ({ gradePracticeItems: mocks.gradePracticeItems }));

import { POST } from "@/app/api/student/practice/grade/route";

function request(body: unknown) {
  return new Request("http://localhost/api/student/practice/grade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/student/practice/grade", () => {
  beforeEach(() => {
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "student-1" } } })) },
    });
    mocks.gradePracticeItems.mockResolvedValue({
      results: [
        {
          question_id: "answer-checker",
          question: "Explain a flip-flop.",
          marks: 5,
          student_answer: "It stores one bit.",
          score: 4,
          feedback: "Correct core idea; add how the state changes.",
        },
      ],
      total_score: 4,
      total_marks: 5,
      graded: true,
    });
  });

  it("maps one student answer to the self-contained tenant grader", async () => {
    const response = await POST(
      request({
        question: "Explain a flip-flop.",
        chapter: "Sequential Logic",
        marks: 5,
        referenceAnswer: "A bistable circuit that stores one bit.",
        studentAnswer: "It stores one bit.",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ totalScore: 4, totalMarks: 5, graded: true });
    expect(mocks.gradePracticeItems).toHaveBeenCalledWith({
      items: [
        {
          question_id: "answer-checker",
          question: "Explain a flip-flop.",
          chapter: "Sequential Logic",
          marks: 5,
          reference_answer: "A bistable circuit that stores one bit.",
          student_answer: "It stores one bit.",
        },
      ],
    });
  });

  it("does not expose the grader without a signed-in student", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    });

    const response = await POST(
      request({ question: "Explain a flip-flop.", marks: 5, studentAnswer: "One bit." }),
    );

    expect(response.status).toBe(401);
    expect(mocks.gradePracticeItems).not.toHaveBeenCalled();
  });

  it("reports a temporary failure when the tenant did not grade", async () => {
    mocks.gradePracticeItems.mockResolvedValue({
      results: [],
      total_score: 0,
      total_marks: 5,
      graded: false,
    });

    const response = await POST(
      request({ question: "Explain a flip-flop.", marks: 5, studentAnswer: "One bit." }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ graded: false });
  });
});
