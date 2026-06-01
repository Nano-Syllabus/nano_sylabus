import { describe, expect, it } from "vitest";
import { buildE2EGroundedAnswer } from "@/lib/ai/e2e-harness";
import type { RetrievalResult } from "@/lib/ai/retrieval";

const retrievalFixture: RetrievalResult = {
  grounded: true,
  chunks: [
    {
      id: "chunk-1",
      documentId: "doc-1",
      board: "Engineering",
      grade: "Bachelor Year I",
      subject: "Engineering Physics",
      chapter: "Unit 8 Electromagnetism",
      topic: "Ohm's law",
      content: "Ohm's law states that V = IR for a conductor under constant temperature.",
      sourceTitle: "Engineering Physics SH402",
      sourceName: "engg-physics.pdf",
      resourceKind: "study_material",
      score: 0.95,
    },
  ],
  citations: [
    {
      chunkId: "chunk-1",
      documentId: "doc-1",
      sourceType: "textbook",
      sourceLabel: "Engineering Physics · Unit 8 Electromagnetism",
      sourceTitle: "Engineering Physics SH402",
      sourceName: "engg-physics.pdf",
      subject: "Engineering Physics",
      chapter: "Unit 8 Electromagnetism",
      topic: "Ohm's law",
      excerpt: "Ohm's law states that V = IR for a conductor under constant temperature.",
    },
  ],
};

describe("e2e harness language mode behavior", () => {
  it("returns English answer when mode is EN even if question is Nepali", () => {
    const answer = buildE2EGroundedAnswer({
      question: "ओहम्स ल को बारेमा बुझाइदिनुहोस्।",
      retrieval: retrievalFixture,
      language: "EN",
    });

    expect(answer.toLowerCase()).toContain("based on the indexed textbook context");
  });

  it("returns Roman Nepali answer when mode is RN even if question is English", () => {
    const answer = buildE2EGroundedAnswer({
      question: "Please explain Ohm's law.",
      retrieval: retrievalFixture,
      language: "RN",
    });

    expect(answer.toLowerCase()).toContain("indexed textbook context anusar");
  });
});
