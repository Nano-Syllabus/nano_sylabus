import { describe, expect, it } from "vitest";
import {
  normalizeBoard,
  normalizeGrade,
  normalizeSubjectLabel,
  normalizeSubjects,
  validateBoardScore,
} from "@/lib/profile-normalization";

describe("profile normalization", () => {
  it("normalizes board and grade values for consistent retrieval scope", () => {
    expect(normalizeBoard(" neb ")).toBe("NEB");
    expect(normalizeGrade("11")).toBe("Class 11");
    expect(normalizeGrade(" class   12 ")).toBe("Class 12");
    expect(normalizeGrade("bbs year 1")).toBe("BBS Year 1");
  });

  it("normalizes subject labels and removes case-only duplicates", () => {
    expect(normalizeSubjectLabel("physics")).toBe("Physics");
    expect(normalizeSubjectLabel("computer science")).toBe("Computer Science");
    expect(normalizeSubjects(["physics", " Physics ", "computer science"])).toEqual([
      "Physics",
      "Computer Science",
    ]);
  });

  it("validates board score ranges", () => {
    expect(validateBoardScore("82", "%")).toBeNull();
    expect(validateBoardScore("4", "GPA")).toBeNull();
    expect(validateBoardScore("101", "%")).toBe("Score must be between 0 and 100.");
    expect(validateBoardScore("4.5", "GPA")).toBe("GPA must be between 0 and 4.0.");
  });
});
