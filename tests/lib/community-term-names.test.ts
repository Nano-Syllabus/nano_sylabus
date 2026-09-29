import { describe, expect, it } from "vitest";
import {
  communityHasTermChoice,
  communityTermLayout,
  communityTermName,
  communityTermNoun,
} from "@/lib/communities";

const term = { yearNumber: 2, semesterNumber: 3 };

describe("community term names", () => {
  it("names +2 terms as classes, never semesters", () => {
    const plusTwo = { level: "+2", totalYears: 2, totalSemesters: 2 };
    expect(communityTermName(plusTwo, { yearNumber: 1, semesterNumber: 1 }, "short")).toBe("Class 11");
    expect(communityTermName(plusTwo, { yearNumber: 2, semesterNumber: 2 }, "full")).toBe("Class 12");
    expect(communityTermNoun(plusTwo)).toBe("Class");
  });

  it("gives Entrance and License no terms at all, even with a legacy degree layout", () => {
    for (const level of ["Entrance", "License"]) {
      const faculty = { level, totalYears: 4, totalSemesters: 8, terms: [1, 2, 3] };
      expect(communityTermLayout(faculty)).toBe("single-track");
      expect(communityTermNoun(faculty)).toBeNull();
      expect(communityHasTermChoice(faculty)).toBe(false);
      expect(communityTermName(faculty, term, "short")).toBe("All subjects");
    }
  });

  it("guesses the level from the name when it was never stored", () => {
    const old = { level: null, name: "Loksewa Licence Prep", faculty: "Engineering", totalYears: 4, totalSemesters: 8 };
    expect(communityTermLayout(old)).toBe("single-track");
  });

  it("keeps semesters for a semester-wise degree and years for a year-wise one", () => {
    const semesters = { level: "Bachelor", totalYears: 4, totalSemesters: 8 };
    expect(communityTermName(semesters, term, "short")).toBe("3rd Semester");
    expect(communityTermName(semesters, term, "full")).toBe("Year 2 · Semester 3");
    const years = { level: "Bachelor", totalYears: 4, totalSemesters: 4 };
    expect(communityTermName(years, term, "short")).toBe("2nd Year");
    expect(communityTermNoun(years)).toBe("Year");
  });
});
