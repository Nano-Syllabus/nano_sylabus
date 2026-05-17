import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
}));

import { getKnowledgeChunkDetail } from "@/lib/data/knowledge";

describe("getKnowledgeChunkDetail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns a normalized chunk detail within the student's board and grade", async () => {
    const chunkMaybeSingle = vi.fn(async () => ({
      data: {
        id: "chunk-1",
        document_id: "doc-1",
        board: "neb",
        grade: "11",
        subject: "physics",
        chapter: "Unit 1",
        topic: "Force",
        content: "Force equals mass times acceleration.",
        chunk_index: 0,
        created_at: "2026-05-17T00:00:00.000Z",
      },
      error: null,
    }));
    const documentMaybeSingle = vi.fn(async () => ({
      data: {
        title: "Class 11 Physics",
        source_name: "physics.pdf",
        source_type: "pdf",
        uploaded_at: "2026-05-16T00:00:00.000Z",
      },
      error: null,
    }));

    const from = vi.fn((table: string) => {
      if (table === "knowledge_chunks") {
        const eq = vi.fn(() => ({ maybeSingle: chunkMaybeSingle }));
        const select = vi.fn(() => ({ eq }));
        return { select };
      }

      if (table === "knowledge_documents") {
        const eq = vi.fn(() => ({ maybeSingle: documentMaybeSingle }));
        const select = vi.fn(() => ({ eq }));
        return { select };
      }

      throw new Error(`Unexpected table ${table}`);
    });
    createSupabaseServerClient.mockResolvedValue({ from });

    const result = await getKnowledgeChunkDetail("chunk-1", {
      userId: "user-1",
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
    });

    expect(result?.board).toBe("NEB");
    expect(result?.grade).toBe("Class 11");
    expect(result?.subject).toBe("Physics");
    expect(result?.sourceTitle).toBe("Class 11 Physics");
  });

  it("returns null when the chunk is outside the student's board or grade scope", async () => {
    const chunkMaybeSingle = vi.fn(async () => ({
      data: {
        id: "chunk-1",
        document_id: "doc-1",
        board: "TU",
        grade: "BBS Year 1",
        subject: "Business Mathematics",
        chapter: null,
        topic: null,
        content: "Out of scope content",
        chunk_index: 0,
        created_at: "2026-05-17T00:00:00.000Z",
      },
      error: null,
    }));
    const documentMaybeSingle = vi.fn(async () => ({
      data: {
        title: "BBS Mathematics",
        source_name: "bbs-math.pdf",
        source_type: "pdf",
        uploaded_at: "2026-05-16T00:00:00.000Z",
      },
      error: null,
    }));

    const from = vi.fn((table: string) => {
      if (table === "knowledge_chunks") {
        const eq = vi.fn(() => ({ maybeSingle: chunkMaybeSingle }));
        const select = vi.fn(() => ({ eq }));
        return { select };
      }

      if (table === "knowledge_documents") {
        const eq = vi.fn(() => ({ maybeSingle: documentMaybeSingle }));
        const select = vi.fn(() => ({ eq }));
        return { select };
      }

      throw new Error(`Unexpected table ${table}`);
    });
    createSupabaseServerClient.mockResolvedValue({ from });

    const result = await getKnowledgeChunkDetail("chunk-1", {
      userId: "user-1",
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
    });

    expect(result).toBeNull();
  });
});
