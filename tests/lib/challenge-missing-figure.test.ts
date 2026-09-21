import { beforeEach, describe, expect, it, vi } from "vitest";
import { communityLearningFixture } from "../helpers/learning-database";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  access: vi.fn(),
  image: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/lib/student-courses", () => ({
  getStudentCourseSubjectAccessForCourse: mocks.access,
  getStudentCourseSubjectAccess: mocks.access,
  getStudentCourseSubjectAccessCached: mocks.access,
}));
vi.mock("@/lib/teacher-app/client", async (original) => ({
  ...(await original<typeof import("@/lib/teacher-app/client")>()),
  requestTeacherMediaImage: mocks.image,
}));

import { drawMissingChallengeFigure } from "@/lib/data/student-challenges";
import { invalidateMemo } from "@/lib/http/memo";

/**
 * A worked solution that says "### Diagram" over nothing gets its picture once.
 *
 * Production had no renderer until 2026-09-21, so every solution asked to
 * "sketch" was stored as a heading alone. The screen asks for the figure; the
 * server briefs the renderer from the stored question and files the image on
 * the row, so no later view asks again.
 */

const DIAGRAM_QUESTION =
  "A digital system defines logic-1 as a nominal 3V signal and logic-0 as a nominal 0V signal. Sketch the voltage signal range diagram for this system.";
const WORDED_QUESTION = "Explain the concept of positive logic versus negative logic.";

type Row = Record<string, unknown>;
type Example = { question: string; solution: string };

describe("drawing the diagram a worked solution lost", () => {
  let db: ReturnType<typeof communityLearningFixture>;
  const examples = () =>
    ((db.tables.student_challenges[0] as Row).content as { solvedExamples: Example[] })
      .solvedExamples;

  beforeEach(() => {
    vi.clearAllMocks();
    invalidateMemo("challenge:collection-sk");
    db = communityLearningFixture();
    db.tables.student_challenges = [
      {
        id: "c1",
        user_id: "member",
        course_id: "course-1",
        subject_slug: "digital-logic",
        subject_name: "Digital Logic",
        status: "started",
        updated_at: "2026-09-21T10:44:16Z",
        content: {
          lesson: { title: "Digital signals", content: ["Voltage levels."], focus: "" },
          pastQuestions: [],
          solvedExamples: [
            { question: DIAGRAM_QUESTION, solution: "### Diagram", marks: 8, year: null },
            {
              question: WORDED_QUESTION,
              solution: "### Logic Conventions\n\nHigh is 1.",
              marks: 4,
              year: null,
            },
          ],
          examQuestions: [],
        },
      },
    ];
    mocks.admin.mockReturnValue(db.admin);
    mocks.access.mockResolvedValue({ teacherId: "teacher-1", subjectName: "Digital Logic" });
    mocks.image.mockResolvedValue({ url: "/api/figure/534df2b3.png", status: "queued" });
  });

  it("briefs the renderer from the stored question and files the picture under its heading", async () => {
    // Found by question text, whatever the screen's spacing and case.
    const result = await drawMissingChallengeFigure(
      "member",
      "c1",
      `  ${DIAGRAM_QUESTION.toUpperCase()} `,
    );

    expect(mocks.image).toHaveBeenCalledTimes(1);
    const [key, input] = mocks.image.mock.calls[0];
    expect(key).toBe("collection");
    expect(input.brief).toContain(`Question: ${DIAGRAM_QUESTION}`);
    expect(input.alt).toBe("Diagram");

    expect(result.reason).toBeUndefined();
    expect(result.solution).toBe("### Diagram\n\n![Diagram](/api/figure/534df2b3.png)");
    expect(examples()[0].solution).toBe(result.solution);
    // The other worked example is untouched.
    expect(examples()[1].solution).toBe("### Logic Conventions\n\nHigh is 1.");
    const shown = result.challenge?.content?.solvedExamples?.[0]?.solution;
    expect(shown).toBe(result.solution);
  });

  it("draws nothing the second time: the picture is on the row", async () => {
    await drawMissingChallengeFigure("member", "c1", DIAGRAM_QUESTION);
    const again = await drawMissingChallengeFigure("member", "c1", DIAGRAM_QUESTION);
    expect(mocks.image).toHaveBeenCalledTimes(1);
    expect(again.reason).toBe("nothing_missing");
    expect(again.solution).toContain("![Diagram](/api/figure/534df2b3.png)");
  });

  it("leaves the row alone when the renderer cannot take it", async () => {
    mocks.image.mockResolvedValue({
      url: null,
      status: "unavailable",
      detail: "no render service configured",
    });
    const result = await drawMissingChallengeFigure("member", "c1", DIAGRAM_QUESTION);
    expect(result.reason).toBe("unavailable");
    expect(examples()[0].solution).toBe("### Diagram");
  });

  it("never asks for a solution that promised no picture, or a question that is not there", async () => {
    expect((await drawMissingChallengeFigure("member", "c1", WORDED_QUESTION)).reason).toBe(
      "nothing_missing",
    );
    expect((await drawMissingChallengeFigure("member", "c1", "What is a flip-flop?")).reason).toBe(
      "not_found",
    );
    // Another student's challenge is not found at all.
    expect(
      (await drawMissingChallengeFigure("someone-else", "c1", DIAGRAM_QUESTION)).challenge,
    ).toBeNull();
    expect(mocks.image).not.toHaveBeenCalled();
  });
});
