import { describe, expect, it } from "vitest";
import {
  describeModeRule,
  isAnswerCompliantWithMode,
  resolveResponseLanguage,
} from "@/lib/chat-language-mode";

describe("chat language mode rules", () => {
  it("keeps answer language in English mode even when question is Nepali", () => {
    const resolved = resolveResponseLanguage({
      chatLanguage: "EN",
      messageLanguage: "EN",
    });
    expect(resolved).toBe("EN");
    expect(describeModeRule(resolved)).toContain("English");
  });

  it("keeps answer language in Roman Nepali mode even when question is English", () => {
    const resolved = resolveResponseLanguage({
      chatLanguage: "RN",
      messageLanguage: "RN",
    });
    expect(resolved).toBe("RN");
    expect(describeModeRule(resolved)).toContain("Roman Nepali");
  });

  it("falls back to chat language when message language is not sent", () => {
    expect(resolveResponseLanguage({ chatLanguage: "EN" })).toBe("EN");
    expect(resolveResponseLanguage({ chatLanguage: "RN" })).toBe("RN");
  });

  it("validates English-mode compliance correctly", () => {
    expect(isAnswerCompliantWithMode("This is an English answer.", "EN")).toBe(true);
    expect(isAnswerCompliantWithMode("yo answer thik cha", "EN")).toBe(false);
    expect(isAnswerCompliantWithMode("यो उत्तर नेपालीमा छ", "EN")).toBe(false);
  });

  it("validates Roman Nepali-mode compliance correctly", () => {
    expect(isAnswerCompliantWithMode("yo answer thik cha", "RN")).toBe(true);
    expect(isAnswerCompliantWithMode("यो उत्तर नेपालीमा छ", "RN")).toBe(false);
    expect(isAnswerCompliantWithMode("This answer is in English.", "RN")).toBe(false);
  });
});
