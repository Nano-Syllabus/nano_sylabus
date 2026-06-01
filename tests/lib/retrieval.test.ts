import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, embedText } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  embedText: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
}));

vi.mock("@/lib/ai/embeddings", () => ({
  embedText,
}));

import { retrieveKnowledgeChunks } from "@/lib/ai/retrieval";

function makeSupabaseQueryMock(responses: Array<unknown[]>) {
  const eq = vi.fn();
  const inFn = vi.fn();
  const ilike = vi.fn();
  let callIndex = 0;

  const chain = {
    eq: (...args: unknown[]) => {
      eq(...args);
      return chain;
    },
    in: (...args: unknown[]) => {
      inFn(...args);
      return chain;
    },
    ilike: (...args: unknown[]) => {
      ilike(...args);
      return chain;
    },
    limit: vi.fn(async () => ({
      data: responses[callIndex++] ?? [],
      error: null,
    })),
  };

  const select = vi.fn(() => chain);
  const from = vi.fn(() => ({ select }));
  return { from, eq, inFn, ilike };
}

describe("retrieveKnowledgeChunks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fails closed when profile and subject context are both missing", async () => {
    const from = vi.fn();
    createSupabaseServerClient.mockResolvedValue({ from });

    const result = await retrieveKnowledgeChunks(
      "Explain Newton's law",
      {
        userId: "u1",
        fullName: "Student",
        college: "Campus",
        board: "",
        grade: "",
        boardScore: null,
        subjects: [],
        targetGrade: "A+",
        languagePref: "EN",
        role: "student",
        createdAt: "",
        updatedAt: "",
      },
      { subjectContext: null },
    );

    expect(result.grounded).toBe(false);
    expect(result.chunks).toEqual([]);
    expect(from).not.toHaveBeenCalled();
    expect(embedText).not.toHaveBeenCalled();
  });

  it("queries strict board+grade+subject scope", async () => {
    const { from, eq, inFn } = makeSupabaseQueryMock([
      [
        {
          id: "chunk-1",
          document_id: "doc-1",
          board: "NEB",
          grade: "Class 11",
          subject: "Physics",
          chapter: "Unit 1",
          topic: "Force",
          content: "Force equals mass times acceleration.",
          embedding: [1, 0, 0],
          knowledge_documents: [
            {
              id: "doc-1",
              title: "Class 11 Physics",
              source_name: "official.pdf",
              source_type: "pdf",
            },
          ],
        },
      ],
    ]);
    createSupabaseServerClient.mockResolvedValue({ from });
    embedText.mockResolvedValue([1, 0, 0]);

    const result = await retrieveKnowledgeChunks(
      "Explain Newton's second law",
      {
        userId: "u1",
        fullName: "Student",
        college: "Campus",
        board: "NEB",
        grade: "Class 11",
        boardScore: null,
        subjects: ["Physics", "Chemistry"],
        targetGrade: "A+",
        languagePref: "EN",
        role: "student",
        createdAt: "",
        updatedAt: "",
      },
      { subjectContext: "Physics" },
    );

    expect(eq).toHaveBeenCalledWith("board", "NEB");
    expect(eq).toHaveBeenCalledWith("grade", "Class 11");
    expect(inFn).toHaveBeenCalledWith("subject", ["Physics"]);
    expect(result.grounded).toBe(true);
    expect(result.chunks).toHaveLength(1);
    expect(result.citations[0]?.subject).toBe("Physics");
    expect(result.citations[0]?.sourceTitle).toBe("Class 11 Physics");
    expect(result.citations[0]?.sourceName).toBe("official.pdf");
    expect(result.citations[0]?.excerpt).toBe("Force equals mass times acceleration.");
  });

  it("falls back to subject-like matching when strict subject is unavailable", async () => {
    const { from, ilike } = makeSupabaseQueryMock([
      [],
      [
        {
          id: "chunk-eng-1",
          document_id: "doc-eng-1",
          board: "Engineering",
          grade: "Bachelor",
          subject: "Engineering Physics",
          chapter: "Kinematics",
          topic: "Motion",
          content: "In engineering physics, velocity and acceleration describe motion.",
          embedding: [1, 0, 0],
          knowledge_documents: [
            {
              id: "doc-eng-1",
              title: "Fundamentals of Engineering Physics",
              source_name: "ENGG. PHYSICS BhadraPokhrel.pdf",
              source_type: "pdf",
            },
          ],
        },
      ],
    ]);
    createSupabaseServerClient.mockResolvedValue({ from });
    embedText.mockResolvedValue([1, 0, 0]);

    const result = await retrieveKnowledgeChunks(
      "Explain acceleration in simple terms",
      {
        userId: "u1",
        fullName: "Student",
        college: "Campus",
        board: "NEB",
        grade: "Class 11",
        boardScore: null,
        subjects: ["Physics"],
        targetGrade: "A+",
        languagePref: "EN",
        role: "student",
        createdAt: "",
        updatedAt: "",
      },
      { subjectContext: "Physics" },
    );

    expect(ilike).toHaveBeenCalledWith("subject", "%physics%");
    expect(result.grounded).toBe(true);
    expect(result.chunks[0]?.subject).toBe("Engineering Physics");
  });

  it("builds a trimmed excerpt for long grounded chunks", async () => {
    const longContent =
      "This lesson explains how force, mass, and acceleration relate in practical classroom numericals, " +
      "including how students should identify known values, convert units carefully, and write the final " +
      "equation in a board-exam friendly way before solving the answer step by step with clear working.";
    const { from } = makeSupabaseQueryMock([
      [
        {
          id: "chunk-1",
          document_id: "doc-1",
          board: "NEB",
          grade: "Class 11",
          subject: "Physics",
          chapter: "Unit 1",
          topic: "Force",
          content: longContent,
          embedding: [1, 0, 0],
          knowledge_documents: [
            {
              id: "doc-1",
              title: "Class 11 Physics",
              source_name: "official.pdf",
              source_type: "pdf",
            },
          ],
        },
      ],
    ]);
    createSupabaseServerClient.mockResolvedValue({ from });
    embedText.mockResolvedValue([1, 0, 0]);

    const result = await retrieveKnowledgeChunks(
      "How do I solve force numericals?",
      {
        userId: "u1",
        fullName: "Student",
        college: "Campus",
        board: "NEB",
        grade: "Class 11",
        boardScore: null,
        subjects: ["Physics"],
        targetGrade: "A+",
        languagePref: "EN",
        role: "student",
        createdAt: "",
        updatedAt: "",
      },
      { subjectContext: "Physics" },
    );

    expect(result.grounded).toBe(true);
    expect(result.citations[0]?.excerpt?.length).toBeLessThanOrEqual(223);
    expect(result.citations[0]?.excerpt).toMatch(/\.\.\.$/);
  });

  it("maps syllabus chunks to syllabus citation source type", async () => {
    const { from } = makeSupabaseQueryMock([
      [
        {
          id: "chunk-syl-1",
          document_id: "doc-syl-1",
          board: "Engineering",
          grade: "Bachelor Year I",
          subject: "Engineering Physics",
          chapter: "Unit 1 Oscillation",
          topic: "Free oscillation",
          content: "Course objective and chapter breakdown for Engineering Physics SH402.",
          embedding: [1, 0, 0],
          knowledge_documents: [
            {
              id: "doc-syl-1",
              title: "Engineering Physics SH402 Syllabus",
              source_name: "engineering-physics-sh402-syllabus.txt",
              source_type: "text",
              resource_kind: "syllabus",
            },
          ],
        },
      ],
    ]);

    createSupabaseServerClient.mockResolvedValue({ from });
    embedText.mockResolvedValue([1, 0, 0]);

    const result = await retrieveKnowledgeChunks(
      "Show me SH402 syllabus chapters",
      {
        userId: "u1",
        fullName: "Student",
        college: "Campus",
        board: "Engineering",
        grade: "Bachelor Year I",
        boardScore: null,
        subjects: ["Engineering Physics"],
        targetGrade: "A+",
        languagePref: "EN",
        role: "student",
        createdAt: "",
        updatedAt: "",
      },
      { subjectContext: "Engineering Physics" },
    );

    expect(result.grounded).toBe(true);
    expect(result.citations[0]?.sourceType).toBe("syllabus");
  });

  it("maps question bank chunks to question_bank citation source type", async () => {
    const { from } = makeSupabaseQueryMock([
      [
        {
          id: "chunk-qb-1",
          document_id: "doc-qb-1",
          board: "Engineering",
          grade: "Bachelor Year I",
          subject: "Engineering Electronics",
          chapter: "PN Junction",
          topic: "Practice questions",
          content: "Q1. Explain PN junction diode characteristics.",
          embedding: [1, 0, 0],
          knowledge_documents: [
            {
              id: "doc-qb-1",
              title: "Electronics Question Bank",
              source_name: "electronics-qb.pdf",
              source_type: "pdf",
              resource_kind: "question_bank",
            },
          ],
        },
      ],
    ]);

    createSupabaseServerClient.mockResolvedValue({ from });
    embedText.mockResolvedValue([1, 0, 0]);

    const result = await retrieveKnowledgeChunks(
      "Give me important diode practice questions",
      {
        userId: "u1",
        fullName: "Student",
        college: "Campus",
        board: "Engineering",
        grade: "Bachelor Year I",
        boardScore: null,
        subjects: ["Engineering Electronics"],
        targetGrade: "A+",
        languagePref: "EN",
        role: "student",
        createdAt: "",
        updatedAt: "",
      },
      { subjectContext: "Engineering Electronics" },
    );

    expect(result.grounded).toBe(true);
    expect(result.citations[0]?.sourceType).toBe("question_bank");
  });

  it("prefers syllabus chunks for chapter-number lookup questions", async () => {
    const { from } = makeSupabaseQueryMock([
      [
        {
          id: "chunk-study-1",
          document_id: "doc-study-1",
          board: "Engineering",
          grade: "Bachelor",
          subject: "Engineering Physics",
          chapter: "Physical optics",
          topic: "Interference",
          content: "Chapter 2 discusses optics topics like interference and diffraction.",
          embedding: [1, 0, 0],
          knowledge_documents: [
            {
              id: "doc-study-1",
              title: "Fundamentals of Engineering Physics",
              source_name: "engg-physics-textbook.pdf",
              source_type: "pdf",
              resource_kind: "study_material",
            },
          ],
        },
        {
          id: "chunk-syl-2",
          document_id: "doc-syl-2",
          board: "Engineering",
          grade: "Bachelor",
          subject: "Engineering Physics",
          chapter: "SH 402 Syllabus",
          topic: "Syllabus units",
          content:
            "Syllabus units: 1) Oscillation, 2) Wave motion, 3) Acoustics, 4) Physical optics.",
          embedding: [1, 0, 0],
          knowledge_documents: [
            {
              id: "doc-syl-2",
              title: "Engineering Physics SH 402 Syllabus",
              source_name: "engineering-physics-sh402-syllabus.txt",
              source_type: "text",
              resource_kind: "syllabus",
            },
          ],
        },
      ],
    ]);
    createSupabaseServerClient.mockResolvedValue({ from });
    embedText.mockResolvedValue([1, 0, 0]);

    const result = await retrieveKnowledgeChunks(
      "what our second chapter talks about",
      {
        userId: "u1",
        fullName: "Student",
        college: "Campus",
        board: "Engineering",
        grade: "Bachelor",
        boardScore: null,
        subjects: ["Engineering Physics"],
        targetGrade: "A+",
        languagePref: "EN",
        role: "student",
        createdAt: "",
        updatedAt: "",
      },
      { subjectContext: "Engineering Physics" },
    );

    expect(result.grounded).toBe(true);
    expect(result.citations[0]?.sourceType).toBe("syllabus");
    expect(result.chunks[0]?.sourceTitle).toContain("SH 402 Syllabus");
  });

  it("treats ordinal numeric chapter questions as syllabus-structure intent", async () => {
    const { from } = makeSupabaseQueryMock([
      [
        {
          id: "chunk-study-3",
          document_id: "doc-study-3",
          board: "Engineering",
          grade: "Bachelor",
          subject: "Engineering Physics",
          chapter: "Physical optics",
          topic: "Interference",
          content: "Some textbooks place optics early.",
          embedding: [1, 0, 0],
          knowledge_documents: [
            {
              id: "doc-study-3",
              title: "Fundamentals of Engineering Physics",
              source_name: "engg-physics-textbook.pdf",
              source_type: "pdf",
              resource_kind: "study_material",
            },
          ],
        },
        {
          id: "chunk-syl-3",
          document_id: "doc-syl-3",
          board: "Engineering",
          grade: "Bachelor",
          subject: "Engineering Physics",
          chapter: "SH 402 Syllabus",
          topic: "Syllabus units",
          content:
            "Syllabus units: 1) Oscillation, 2) Wave motion, 3) Acoustics, 4) Physical optics.",
          embedding: [1, 0, 0],
          knowledge_documents: [
            {
              id: "doc-syl-3",
              title: "Engineering Physics SH 402 Syllabus",
              source_name: "engineering-physics-sh402-syllabus.txt",
              source_type: "text",
              resource_kind: "syllabus",
            },
          ],
        },
      ],
    ]);
    createSupabaseServerClient.mockResolvedValue({ from });
    embedText.mockResolvedValue([1, 0, 0]);

    const result = await retrieveKnowledgeChunks(
      "what is our 3rd chapter?",
      {
        userId: "u1",
        fullName: "Student",
        college: "Campus",
        board: "Engineering",
        grade: "Bachelor",
        boardScore: null,
        subjects: ["Engineering Physics"],
        targetGrade: "A+",
        languagePref: "EN",
        role: "student",
        createdAt: "",
        updatedAt: "",
      },
      { subjectContext: "Engineering Physics" },
    );

    expect(result.grounded).toBe(true);
    expect(result.citations[0]?.sourceType).toBe("syllabus");
    expect(result.chunks[0]?.sourceTitle).toContain("SH 402 Syllabus");
  });
});
