import { describe, expect, it } from "vitest";
import {
  containsDevanagari,
  countWords,
  needsEnglishRewrite,
  needsRomanNepaliRewrite,
} from "@/lib/roman-nepali";

describe("Roman Nepali guards", () => {
  it("detects Devanagari text", () => {
    expect(containsDevanagari("Yo Roman Nepali ho")).toBe(false);
    expect(containsDevanagari("यो Roman Nepali होइन")).toBe(true);
  });

  it("requires rewrite only for Roman Nepali responses that violate the contract", () => {
    expect(needsRomanNepaliRewrite("Yo answer thik cha.", "RN")).toBe(false);
    expect(needsRomanNepaliRewrite("यो answer thik chaina.", "RN")).toBe(true);
    expect(needsRomanNepaliRewrite("यो is allowed in English mode.", "EN")).toBe(false);
  });

  it("flags non-English answers when English output is required", () => {
    expect(needsEnglishRewrite("This is already in English.", "EN")).toBe(false);
    expect(needsEnglishRewrite("yo answer thik cha tara roman nepali ma cha", "EN")).toBe(true);
    expect(needsEnglishRewrite("यो answer nepali ma cha", "EN")).toBe(true);
    expect(needsEnglishRewrite("yo answer thik cha", "RN")).toBe(false);
  });

  it("counts words for length guardrails", () => {
    expect(countWords("formula use gara")).toBe(3);
  });
});
