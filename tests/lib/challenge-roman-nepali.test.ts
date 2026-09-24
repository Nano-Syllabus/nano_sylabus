import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { communityLearningFixture } from "../helpers/learning-database";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  access: vi.fn(),
  translate: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/lib/student-courses", () => ({
  getStudentCourseSubjectAccessForCourse: mocks.access,
  getStudentCourseSubjectAccess: mocks.access,
  getStudentCourseSubjectAccessCached: mocks.access,
}));
vi.mock("@/lib/teacher-app/client", async (original) => ({
  ...(await original<typeof import("@/lib/teacher-app/client")>()),
  translateTeacherChallengeTexts: mocks.translate,
}));

import { getStudentChallengeRomanNepali } from "@/lib/data/student-challenges";
import { StudyLanguageSwitch, inStudyLanguage } from "@/components/study-language";
import { normalizeQuestionText } from "@/lib/challenge-learn-questions";
import { invalidateMemo } from "@/lib/http/memo";

/**
 * A challenge's reading and worked answers in Roman Nepali, beside the English.
 *
 * The student picks the language; the course API translates the English already
 * written and pools each translation per text. What this pins: the right texts go
 * up, the answers come back to the right questions, a translation — complete, or
 * partial because the maths was refused — is kept on the row, and a failed
 * service is never kept.
 */

type Row = Record<string, unknown>;
const READING = ["## Identifiers\nAn identifier names a variable.", "Keywords are reserved."];
const QUESTION = "Define an identifier with an example.";
const SOLUTION = "An identifier is a name, e.g. `count`.";
const RN = (text: string) => `RN: ${text}`;

describe("a challenge in Roman Nepali", () => {
  let db: ReturnType<typeof communityLearningFixture>;
  const row = () => db.tables.student_challenges[0] as Row;

  beforeEach(() => {
    vi.clearAllMocks();
    invalidateMemo("challenge:collection-sk");
    db = communityLearningFixture();
    db.tables.student_challenges = [
      {
        id: "c1",
        user_id: "member",
        course_id: "course-1",
        subject_slug: "teacher_nims",
        subject_name: "Nims",
        topic_key: "provider-42",
        topic_title: "Identifiers",
        status: "started",
        updated_at: "2026-09-21T10:00:00.000Z",
        content: {
          provider: "collection-challenge-v1",
          contentStatus: "ready",
          lesson: { title: "Identifiers", content: READING, focus: "" },
          pastQuestions: [{ id: "q1", question: QUESTION, year: "2079", marks: 5 }],
          solvedExamples: [{ year: "2079", question: QUESTION, solution: SOLUTION }],
        },
      },
    ];
    mocks.admin.mockReturnValue(db.admin);
    mocks.access.mockResolvedValue({ teacherId: "teacher-1", subjectName: "Nims" });
    mocks.translate.mockImplementation(async (_key: string, input: { texts: string[] }) => ({
      texts: input.texts.map(RN),
      translated: input.texts.map(() => true),
      served_from: "model",
      warnings: [],
    }));
  });

  it("translates the reading and the worked answers — never the past questions", async () => {
    const result = await getStudentChallengeRomanNepali("member", "c1");

    expect(mocks.translate).toHaveBeenCalledWith(expect.any(String), {
      subject: "Nims",
      texts: [...READING, SOLUTION],
    });
    expect(result?.reading).toEqual(READING.map(RN));
    expect(result?.solutions).toEqual({ [normalizeQuestionText(QUESTION)]: RN(SOLUTION) });
    expect(result?.untranslated).toBe(0);
  });

  it("keeps a complete translation on the row, so switching again is a read", async () => {
    await getStudentChallengeRomanNepali("member", "c1");
    expect((row().content as { romanNepali?: unknown }).romanNepali).toBeTruthy();
    // The attach is onto the row as read: nothing the student sees has changed.
    expect(row().updated_at).toBe("2026-09-21T10:00:00.000Z");

    mocks.translate.mockClear();
    const again = await getStudentChallengeRomanNepali("member", "c1");
    expect(mocks.translate).not.toHaveBeenCalled();
    expect(again?.reading).toEqual(READING.map(RN));
  });

  it("keeps a partial translation: the parts left in English are refused every time", async () => {
    mocks.translate.mockImplementationOnce(async (_key: string, input: { texts: string[] }) => ({
      texts: input.texts.map((text, index) => (index === 1 ? text : RN(text))),
      translated: input.texts.map((_, index) => index !== 1),
      served_from: "model",
      warnings: ["1 part(s) could not be put into Roman Nepali and are shown in English."],
    }));
    const partial = await getStudentChallengeRomanNepali("member", "c1");
    expect(partial?.untranslated).toBe(1);
    expect(partial?.reading[1]).toBe(READING[1]);
    expect((row().content as { romanNepali?: { untranslated: number } }).romanNepali?.untranslated).toBe(1);

    // Asking again is served from the row — no second model call.
    const again = await getStudentChallengeRomanNepali("member", "c1");
    expect(again?.reading[0]).toBe(partial?.reading[0]);
    expect(mocks.translate).toHaveBeenCalledTimes(1);
  });

  it("does not trust an answer that is not aligned with what was sent", async () => {
    mocks.translate.mockResolvedValueOnce({ texts: ["RN: one"], translated: [true], served_from: "model", warnings: [] });
    const result = await getStudentChallengeRomanNepali("member", "c1");
    expect(result?.reading).toEqual(READING);
    expect(result?.solutions[normalizeQuestionText(QUESTION)]).toBe(SOLUTION);
    expect(result?.untranslated).toBe(3);
    // A failed service is not a refusal: nothing is filed, so the next ask retries.
    expect((row().content as { romanNepali?: unknown }).romanNepali).toBeUndefined();
  });

  it("translates again when the English changes — a reading that landed later", async () => {
    await getStudentChallengeRomanNepali("member", "c1");
    const content = row().content as { lesson: { content: string[] } };
    content.lesson.content = [...READING, "A third paragraph landed later."];
    mocks.translate.mockClear();
    const result = await getStudentChallengeRomanNepali("member", "c1");
    expect(mocks.translate).toHaveBeenCalledTimes(1);
    expect(result?.reading).toHaveLength(3);
  });

  it("writes again a translation kept under an older style", async () => {
    await getStudentChallengeRomanNepali("member", "c1");
    const content = row().content as { romanNepali: { sourceHash: string } };
    content.romanNepali.sourceHash = "hash-from-the-previous-style";
    mocks.translate.mockClear();
    await getStudentChallengeRomanNepali("member", "c1");
    expect(mocks.translate).toHaveBeenCalledTimes(1);
  });

  it("asks nothing upstream when there is nothing to translate yet", async () => {
    (row().content as Row).lesson = { title: "", content: [], focus: "" };
    (row().content as Row).solvedExamples = [];
    const result = await getStudentChallengeRomanNepali("member", "c1");
    expect(result).toMatchObject({ reading: [], solutions: {}, untranslated: 0 });
    expect(mocks.translate).not.toHaveBeenCalled();
  });

  it("asks the course API by the subject's slug, whatever it is called now", async () => {
    // The creator renamed the subject: the community shows the new name, the
    // course API still knows the old one. Only the slug is the same in both.
    mocks.access.mockResolvedValue({
      teacherId: "teacher-1",
      subjectName: "Renamed by the creator",
      subjectSlug: "teacher_nims",
    });
    await getStudentChallengeRomanNepali("member", "c1");
    expect(mocks.translate).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ subject: "teacher_nims" }));
  });

  it("is only the student's own challenge", async () => {
    await expect(getStudentChallengeRomanNepali("someone-else", "c1")).resolves.toBeNull();
    expect(mocks.translate).not.toHaveBeenCalled();
  });
});

describe("the language switch", () => {
  const ready = {
    status: "ready" as const,
    data: { sourceHash: "h", reading: ["RN para"], solutions: { q: "RN answer" }, untranslated: 0 },
  };

  it("shows the English until the Roman Nepali is there, and falls back item by item", () => {
    expect(inStudyLanguage("en", ready, (data) => data.reading, ["para"])).toEqual(["para"]);
    expect(inStudyLanguage("rn", { status: "loading" }, (data) => data.reading, ["para"])).toEqual(["para"]);
    expect(inStudyLanguage("rn", ready, (data) => data.reading, ["para"])).toEqual(["RN para"]);
    expect(inStudyLanguage("rn", ready, (data) => data.solutions.q, "answer")).toBe("RN answer");
    // A question with no translation keeps its English answer.
    expect(inStudyLanguage("rn", ready, (data) => data.solutions.other, "answer")).toBe("answer");
    // A reading of a different length is not a translation of this one.
    expect(inStudyLanguage("rn", ready, (data) => data.reading, ["a", "b"])).toEqual(["a", "b"]);
  });

  it("offers both languages and says what the Roman Nepali is doing", () => {
    const html = (value: "en" | "rn", translation: Parameters<typeof StudyLanguageSwitch>[0]["translation"]) =>
      renderToStaticMarkup(createElement(StudyLanguageSwitch, { value, onChange: () => {}, translation }));
    const english = html("en", { status: "idle" });
    expect(english).toContain('role="radiogroup"');
    expect(english).toContain(">English</button>");
    expect(english).toContain(">Roman Nepali</button>");
    expect(english).toMatch(/aria-checked="true"[^>]*>English</);
    expect(html("rn", { status: "loading" })).toContain("Putting this into Roman Nepali…");
    expect(html("rn", { ...ready, data: { ...ready.data, untranslated: 2 } })).toContain(
      "shown in English",
    );
    expect(html("rn", ready)).not.toContain('role="status"');
  });

  it("is on the challenge's step one and on its Revision page, for the reading and the answers", () => {
    const challenge = readFileSync("components/challenges-dashboard-client.tsx", "utf8");
    const revision = readFileSync("components/revision-docs-client.tsx", "utf8");
    for (const source of [challenge, revision]) {
      expect(source).toContain("<StudyLanguageSwitch");
      expect(source).toMatch(/inStudyLanguage\([\s\S]*?\(data\) => data\.reading/);
      expect(source).toMatch(/inStudyLanguage\([\s\S]*?\(data\) => data\.solutions\[/);
    }
    // Past questions are quoted as the paper prints them.
    expect(challenge).not.toMatch(/inStudyLanguage\([^)]*item\.question/);
    // Starts in English: switching it on is what pays for a topic's first translation.
    expect(readFileSync("components/study-language.tsx", "utf8")).toContain(
      'const DEFAULT_LANGUAGE: StudyLanguage = "en";',
    );
  });
});
