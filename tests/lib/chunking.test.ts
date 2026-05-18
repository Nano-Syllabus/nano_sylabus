import { describe, expect, it } from "vitest";
import { chunkDocumentContent } from "@/lib/ai/chunking";

describe("chunkDocumentContent", () => {
  it("splits long source text into ordered chunks", () => {
    const source = Array.from({ length: 8 }, (_, index) =>
      `Paragraph ${index + 1}. This is a textbook-style explanation for unit ${index + 1}. It contains enough words to force the chunker to group and split content in a predictable way for testing.`,
    ).join("\n\n");

    const chunks = chunkDocumentContent(source);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.chunkIndex).toBe(0);
    expect(chunks.at(-1)?.chunkIndex).toBe(chunks.length - 1);
    expect(chunks.every((chunk) => chunk.content.trim().length > 0)).toBe(true);
  });

  it("returns an empty array for empty content", () => {
    expect(chunkDocumentContent("   \n\n  ")).toEqual([]);
  });
});
