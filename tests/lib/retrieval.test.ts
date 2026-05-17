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

describe("retrieveKnowledgeChunks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fails closed when board is missing", async () => {
    const from = vi.fn();
    createSupabaseServerClient.mockResolvedValue({ from });

    const result = await retrieveKnowledgeChunks(
      "Explain Newton's law",
      {
        userId: "u1",
        fullName: "Student",
        college: "Campus",
        board: "",
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

    expect(result.grounded).toBe(false);
    expect(result.chunks).toEqual([]);
    expect(from).not.toHaveBeenCalled();
    expect(embedText).not.toHaveBeenCalled();
  });

  it("queries strict board+grade+subject scope", async () => {
    const eq = vi.fn();
    const inFn = vi.fn();
    const limit = vi.fn(async () => ({
      data: [
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
      error: null,
    }));

    const select = vi.fn(() => ({
      eq: (...args: unknown[]) => {
        eq(...args);
        return {
          eq: (...args2: unknown[]) => {
            eq(...args2);
            return {
              in: (...args3: unknown[]) => {
                inFn(...args3);
                return { limit };
              },
            };
          },
        };
      },
    }));

    const from = vi.fn(() => ({ select }));
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

  it("builds a trimmed excerpt for long grounded chunks", async () => {
    const longContent =
      "This lesson explains how force, mass, and acceleration relate in practical classroom numericals, " +
      "including how students should identify known values, convert units carefully, and write the final " +
      "equation in a board-exam friendly way before solving the answer step by step with clear working.";
    const limit = vi.fn(async () => ({
      data: [
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
      error: null,
    }));

    const select = vi.fn(() => ({
      eq: () => ({
        eq: () => ({
          in: () => ({ limit }),
        }),
      }),
    }));

    const from = vi.fn(() => ({ select }));
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
});
