import { describe, expect, it } from "vitest";
import { buildKnowledgeSourceStoragePath } from "@/lib/knowledge-storage";

describe("buildKnowledgeSourceStoragePath", () => {
  it("creates a document-prefixed sanitized storage path", () => {
    const path = buildKnowledgeSourceStoragePath("doc-123", "Class 11 English Book.pdf");
    expect(path.startsWith("doc-123/")).toBe(true);
    expect(path.endsWith("class-11-english-book.pdf")).toBe(true);
  });
});
