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

import { buildGroundingPrompt, retrieveKnowledgeChunks } from "@/lib/ai/retrieval";

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

    expect(inFn).toHaveBeenCalledWith("subject", ["Physics"]);
    expect(result.grounded).toBe(true);
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]?.board).toBe("NEB");
    expect(result.chunks[0]?.grade).toBe("Class 11");
    expect(result.citations[0]?.subject).toBe("Physics");
    expect(result.citations[0]?.sourceTitle).toBe("Class 11 Physics");
    expect(result.citations[0]?.sourceName).toBe("official.pdf");
    expect(result.citations[0]?.excerpt).toBe("Force equals mass times acceleration.");
  });

  it("falls back to subject-like matching when strict subject is unavailable", async () => {
    const { from, ilike, inFn } = makeSupabaseQueryMock([
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

    expect(inFn).toHaveBeenCalledWith("subject", ["Physics"]);
    expect(ilike).toHaveBeenCalledWith("board", "NEB");
    expect(ilike).toHaveBeenCalledWith("grade", "Class 11");
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

  it("reranks chapter-exact grounded chunks above noisy generic candidates", async () => {
    const { from } = makeSupabaseQueryMock([
      [
        {
          id: "chunk-generic-1",
          document_id: "doc-generic-1",
          board: "Engineering",
          grade: "Bachelor",
          subject: "Engineering Physics",
          chapter: "General formula sheet",
          topic: "Overview",
          content:
            "Physics uses many formulas including work, power, energy, momentum, heat, light, sound, electricity and many other concepts in engineering.",
          embedding: [1, 0, 0],
          knowledge_documents: [
            {
              id: "doc-generic-1",
              title: "Engineering Physics handbook",
              source_name: "handbook.pdf",
              source_type: "pdf",
              resource_kind: "study_material",
            },
          ],
        },
        {
          id: "chunk-target-1",
          document_id: "doc-target-1",
          board: "Engineering",
          grade: "Bachelor",
          subject: "Engineering Physics",
          chapter: "Unit 2 Wave Motion",
          topic: "Important formulas",
          content:
            "Wave motion important formulas include v = f lambda, phase velocity relations, angular frequency, wave number, and displacement equation.",
          embedding: [0.7, 0, 0],
          knowledge_documents: [
            {
              id: "doc-target-1",
              title: "Engineering Physics Unit 2 Wave Motion",
              source_name: "wave-motion.pdf",
              source_type: "pdf",
              resource_kind: "study_material",
            },
          ],
        },
      ],
    ]);
    createSupabaseServerClient.mockResolvedValue({ from });
    embedText.mockResolvedValue([1, 0, 0]);

    const result = await retrieveKnowledgeChunks(
      "Summarize the important formulas in Unit 2 Wave Motion",
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
    expect(result.chunks[0]?.documentId).toBe("doc-target-1");
    expect(result.citations[0]?.chapter).toBe("Unit 2 Wave Motion");
  });

  it("narrows retrieval search space with chapter hints before broad ranking", async () => {
    const { from, ilike } = makeSupabaseQueryMock([
      [
        {
          id: "chunk-target-2",
          document_id: "doc-target-2",
          board: "Engineering",
          grade: "Bachelor",
          subject: "Engineering Physics",
          chapter: "Unit 2 Wave Motion",
          topic: "Important formulas",
          content: "Unit 2 covers phase velocity, wavelength, and wave equation formulas.",
          embedding: [1, 0, 0],
          knowledge_documents: [
            {
              id: "doc-target-2",
              title: "Engineering Physics Unit 2 Wave Motion",
              source_name: "wave-motion.pdf",
              source_type: "pdf",
              resource_kind: "study_material",
            },
          ],
        },
      ],
    ]);
    createSupabaseServerClient.mockResolvedValue({ from });
    embedText.mockResolvedValue([1, 0, 0]);

    const result = await retrieveKnowledgeChunks(
      "Summarize the important formulas in Unit 2 Wave Motion",
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

    expect(ilike).toHaveBeenCalledWith("chapter", "%unit 2%");
    expect(result.grounded).toBe(true);
    expect(result.chunks[0]?.chapter).toBe("Unit 2 Wave Motion");
  });

  it("builds cleaner grouped citations for repeated chunks from the same source", async () => {
    const { from } = makeSupabaseQueryMock([
      [
        {
          id: "chunk-dup-1",
          document_id: "doc-dup-1",
          board: "Engineering",
          grade: "Bachelor",
          subject: "Engineering Physics",
          chapter: "Unit 2 Wave Motion",
          topic: "Wave equation",
          content:
            "The standard wave equation connects displacement, angular frequency, and wave number for travelling waves.",
          chunk_index: 0,
          embedding: [1, 0, 0],
          knowledge_documents: [
            {
              id: "doc-dup-1",
              title: "Untitled source",
              source_name: "unknown-source",
              source_type: "pdf",
              resource_kind: "study_material",
            },
          ],
        },
        {
          id: "chunk-dup-2",
          document_id: "doc-dup-1",
          board: "Engineering",
          grade: "Bachelor",
          subject: "Engineering Physics",
          chapter: "Unit 2 Wave Motion",
          topic: "Wave equation",
          content:
            "Phase velocity and frequency stay linked through v = f lambda, which is one of the most reused wave relations.",
          chunk_index: 1,
          embedding: [0.95, 0, 0],
          knowledge_documents: [
            {
              id: "doc-dup-1",
              title: "Untitled source",
              source_name: "unknown-source",
              source_type: "pdf",
              resource_kind: "study_material",
            },
          ],
        },
      ],
    ]);
    createSupabaseServerClient.mockResolvedValue({ from });
    embedText.mockResolvedValue([1, 0, 0]);

    const result = await retrieveKnowledgeChunks(
      "Explain the wave equation and formulas in Unit 2 Wave Motion",
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
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]?.sourceTitle).toBe("Unit 2 Wave Motion");
    expect(result.citations[0]?.sourceName).toBe("");
    expect(result.citations[0]?.sourceLabel).toBe("Engineering Physics · Unit 2 Wave Motion · Wave equation");
  });

  it("uses vectorless full-chapter retrieval and returns sequential chunks from one document", async () => {
    const { from } = makeSupabaseQueryMock([
      [
        {
          id: "chunk-full-2",
          document_id: "doc-full-1",
          board: "Engineering",
          grade: "Bachelor",
          subject: "Engineering Physics",
          chapter: "Unit 2 Wave Motion",
          topic: "Part 2",
          content: "Wave motion section two explains wave equation and phase velocity.",
          chunk_index: 1,
          embedding: [0.2, 0.2, 0.1],
          knowledge_documents: [
            {
              id: "doc-full-1",
              title: "Engineering Physics Unit 2",
              source_name: "wave-motion.pdf",
              source_type: "pdf",
              resource_kind: "study_material",
            },
          ],
        },
        {
          id: "chunk-full-1",
          document_id: "doc-full-1",
          board: "Engineering",
          grade: "Bachelor",
          subject: "Engineering Physics",
          chapter: "Unit 2 Wave Motion",
          topic: "Part 1",
          content: "Wave motion section one introduces travelling waves and terminology.",
          chunk_index: 0,
          embedding: [0.2, 0.2, 0.1],
          knowledge_documents: [
            {
              id: "doc-full-1",
              title: "Engineering Physics Unit 2",
              source_name: "wave-motion.pdf",
              source_type: "pdf",
              resource_kind: "study_material",
            },
          ],
        },
        {
          id: "chunk-other-1",
          document_id: "doc-other-1",
          board: "Engineering",
          grade: "Bachelor",
          subject: "Engineering Physics",
          chapter: "Unit 3 Acoustics",
          topic: "Noise",
          content: "Acoustics discusses sound intensity and loudness.",
          chunk_index: 0,
          embedding: [0.9, 0.9, 0.9],
          knowledge_documents: [
            {
              id: "doc-other-1",
              title: "Engineering Physics Unit 3",
              source_name: "acoustics.pdf",
              source_type: "pdf",
              resource_kind: "study_material",
            },
          ],
        },
      ],
    ]);
    createSupabaseServerClient.mockResolvedValue({ from });

    const result = await retrieveKnowledgeChunks(
      "Give me the full chapter on wave motion",
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

    expect(embedText).not.toHaveBeenCalled();
    expect(result.grounded).toBe(true);
    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0]?.documentId).toBe("doc-full-1");
    expect(result.chunks[1]?.documentId).toBe("doc-full-1");
    expect(result.chunks[0]?.chunkIndex).toBe(0);
    expect(result.chunks[1]?.chunkIndex).toBe(1);
  });

  it("compresses grounding context for normal answers", () => {
    const prompt = buildGroundingPrompt([
      {
        id: "chunk-1",
        documentId: "doc-1",
        board: "Engineering",
        grade: "Bachelor",
        subject: "Engineering Physics",
        chapter: "Unit 2 Wave Motion",
        topic: "Important formulas",
        content:
          "Wave motion important formulas include v = f lambda. ".repeat(40),
        sourceTitle: "Engineering Physics Unit 2 Wave Motion",
        sourceName: "wave-motion.pdf",
        resourceKind: "study_material",
        score: 0.91,
        chunkIndex: 0,
      },
      {
        id: "chunk-2",
        documentId: "doc-2",
        board: "Engineering",
        grade: "Bachelor",
        subject: "Engineering Physics",
        chapter: "Unit 2 Wave Motion",
        topic: "Phase velocity",
        content:
          "Phase velocity links angular frequency and wave number. ".repeat(40),
        sourceTitle: "Engineering Physics Unit 2 Wave Motion",
        sourceName: "wave-motion.pdf",
        resourceKind: "study_material",
        score: 0.88,
        chunkIndex: 1,
      },
      {
        id: "chunk-3",
        documentId: "doc-3",
        board: "Engineering",
        grade: "Bachelor",
        subject: "Engineering Physics",
        chapter: "Unit 2 Wave Motion",
        topic: "Wave equation",
        content:
          "The wave equation describes propagation in a medium. ".repeat(40),
        sourceTitle: "Engineering Physics Unit 2 Wave Motion",
        sourceName: "wave-motion.pdf",
        resourceKind: "study_material",
        score: 0.84,
        chunkIndex: 2,
      },
      {
        id: "chunk-4",
        documentId: "doc-4",
        board: "Engineering",
        grade: "Bachelor",
        subject: "Engineering Physics",
        chapter: "Unit 2 Wave Motion",
        topic: "Intensity",
        content: "Wave intensity and energy transport. ".repeat(40),
        sourceTitle: "Engineering Physics Unit 2 Wave Motion",
        sourceName: "wave-motion.pdf",
        resourceKind: "study_material",
        score: 0.8,
        chunkIndex: 3,
      },
      {
        id: "chunk-5",
        documentId: "doc-5",
        board: "Engineering",
        grade: "Bachelor",
        subject: "Engineering Physics",
        chapter: "Unit 2 Wave Motion",
        topic: "Boundary behavior",
        content: "Reflection and transmission at boundaries. ".repeat(40),
        sourceTitle: "Engineering Physics Unit 2 Wave Motion",
        sourceName: "wave-motion.pdf",
        resourceKind: "study_material",
        score: 0.76,
        chunkIndex: 4,
      },
    ]);

    expect(prompt).toContain("[Source 1]");
    expect(prompt).toContain("Type: study_material | Title:");
    expect(prompt).not.toContain("Resource type:");
    expect(prompt).not.toContain("[Source 5]");
    expect(prompt.length).toBeLessThan(2600);
  });

  it("allows a wider but still compact grounding prompt for chapter-mode answers", () => {
    const chunks = Array.from({ length: 7 }, (_, index) => ({
      id: `chunk-${index + 1}`,
      documentId: `doc-${index + 1}`,
      board: "Engineering",
      grade: "Bachelor",
      subject: "Engineering Physics",
      chapter: "Unit 2 Wave Motion",
      topic: `Section ${index + 1}`,
      content: `Section ${index + 1} content `.repeat(60),
      sourceTitle: "Engineering Physics Unit 2 Wave Motion",
      sourceName: "wave-motion.pdf",
      resourceKind: "study_material" as const,
      score: 0.9 - index * 0.05,
      chunkIndex: index,
    }));

    const prompt = buildGroundingPrompt(chunks);

    expect(prompt).toContain("[Source 6]");
    expect(prompt).not.toContain("[Source 7]");
    expect(prompt.length).toBeLessThan(5200);
  });
});
