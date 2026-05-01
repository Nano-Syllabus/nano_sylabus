import { describe, expect, it } from "vitest";
import {
  containsDevanagari,
  countWords,
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

  it("counts words for length guardrails", () => {
    expect(countWords("formula use gara")).toBe(3);
  });
});

