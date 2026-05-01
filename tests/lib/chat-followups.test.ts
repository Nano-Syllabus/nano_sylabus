import { describe, expect, it } from "vitest";
import { parseFollowUpSuggestions } from "@/lib/chat-followups";

describe("parseFollowUpSuggestions", () => {
  it("extracts up to three clean follow-up questions", () => {
    expect(
      parseFollowUpSuggestions(`
1. How do I apply this in a board exam answer?
- What formula should I memorize here?
3) Can you give me one practice question?
4. Extra question
      `),
    ).toEqual([
      "How do I apply this in a board exam answer?",
      "What formula should I memorize here?",
      "Can you give me one practice question?",
    ]);
  });

  it("deduplicates repeated suggestions", () => {
    expect(
      parseFollowUpSuggestions(`
What is the shortcut method?
What is the shortcut method?
Can you explain it in Roman Nepali?
      `),
    ).toEqual([
      "What is the shortcut method?",
      "Can you explain it in Roman Nepali?",
    ]);
  });
});

