import { describe, expect, it } from "vitest";
import {
  deriveKnowledgeTitleFromFilename,
  detectKnowledgeUploadKind,
  extractKnowledgeFileContent,
} from "@/lib/knowledge-upload";

describe("deriveKnowledgeTitleFromFilename", () => {
  it("creates a readable title from the filename", () => {
    expect(deriveKnowledgeTitleFromFilename("class11-english_unit-1.pdf")).toBe("class11 english unit 1");
  });
});

describe("detectKnowledgeUploadKind", () => {
  it("recognizes docx uploads", () => {
    expect(
      detectKnowledgeUploadKind(
        "notes.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toEqual({
      kind: "docx",
      sourceType: "docx",
    });
  });

  it("rejects unsupported uploads", () => {
    expect(() => detectKnowledgeUploadKind("audio.mp3", "audio/mpeg")).toThrow(
      "Unsupported file type. Upload PDF, DOCX, TXT, or Markdown files.",
    );
  });
});

describe("extractKnowledgeFileContent", () => {
  it("extracts plain text uploads without extra whitespace noise", async () => {
    const file = new File(["Chapter 1\r\n\r\n\r\nGrammar basics"], "english.txt", { type: "text/plain" });
    await expect(extractKnowledgeFileContent(file)).resolves.toMatchObject({
      sourceName: "english.txt",
      sourceType: "text",
      suggestedTitle: "english",
      rawContent: "Chapter 1\n\nGrammar basics",
    });
  });
});
