import { describe, expect, it } from "vitest";
import { inferSessionSubjectContext, isGeneralSubjectTag } from "@/lib/chat-subject-context";

describe("chat subject context inference", () => {
  it("keeps an explicit existing subject context", () => {
    expect(
      inferSessionSubjectContext({
        existingSubjectContext: "Physics",
        resolvedSubjectTags: ["Physics"],
        citations: [],
      }),
    ).toBe("Physics");
  });

  it("infers a single clear subject from grounded citations", () => {
    expect(
      inferSessionSubjectContext({
        existingSubjectContext: null,
        resolvedSubjectTags: ["General", "Physics"],
        citations: [
          {
            chunkId: "chunk-1",
            documentId: "doc-1",
            sourceLabel: "Physics · Unit 1",
            sourceTitle: "Class 11 Physics",
            sourceName: "physics.pdf",
            subject: "physics",
            chapter: "Unit 1",
            topic: null,
          },
        ],
      }),
    ).toBe("Physics");
  });

  it("does not force a single context for multi-subject questions", () => {
    expect(
      inferSessionSubjectContext({
        existingSubjectContext: null,
        resolvedSubjectTags: ["Physics", "Mathematics"],
        citations: [
          {
            chunkId: "chunk-1",
            documentId: "doc-1",
            sourceLabel: "Physics · Unit 1",
            sourceTitle: "Class 11 Physics",
            sourceName: "physics.pdf",
            subject: "Physics",
            chapter: "Unit 1",
            topic: null,
          },
          {
            chunkId: "chunk-2",
            documentId: "doc-2",
            sourceLabel: "Mathematics · Unit 2",
            sourceTitle: "Class 11 Mathematics",
            sourceName: "math.pdf",
            subject: "Mathematics",
            chapter: "Unit 2",
            topic: null,
          },
        ],
      }),
    ).toBeNull();
  });

  it("treats General as a non-specific tag", () => {
    expect(isGeneralSubjectTag("General")).toBe(true);
    expect(isGeneralSubjectTag("Physics")).toBe(false);
  });
});
