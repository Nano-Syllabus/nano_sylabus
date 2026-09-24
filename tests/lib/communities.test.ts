import { describe, expect, it } from "vitest";
import {
  communityInputSchema,
  communityLevel,
  communitySlug,
  generateCommunityTerms,
  mapCommunitySummary,
  selectStudentCommunity,
} from "@/lib/communities";

describe("communities", () => {
  it("generates the 4-year, 8-semester structure in order", () => {
    expect(generateCommunityTerms(4, 8)).toEqual([
      { yearNumber: 1, semesterNumber: 1, semesterInYear: 1, position: 0 },
      { yearNumber: 1, semesterNumber: 2, semesterInYear: 2, position: 1 },
      { yearNumber: 2, semesterNumber: 3, semesterInYear: 1, position: 2 },
      { yearNumber: 2, semesterNumber: 4, semesterInYear: 2, position: 3 },
      { yearNumber: 3, semesterNumber: 5, semesterInYear: 1, position: 4 },
      { yearNumber: 3, semesterNumber: 6, semesterInYear: 2, position: 5 },
      { yearNumber: 4, semesterNumber: 7, semesterInYear: 1, position: 6 },
      { yearNumber: 4, semesterNumber: 8, semesterInYear: 2, position: 7 },
    ]);
  });

  it("distributes uneven semester counts without losing a year", () => {
    const terms = generateCommunityTerms(4, 10);
    expect(terms).toHaveLength(10);
    expect([...new Set(terms.map((term) => term.yearNumber))]).toEqual([1, 2, 3, 4]);
    expect(terms.map((term) => term.semesterNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("validates a public academic community", () => {
    const parsed = communityInputSchema.safeParse({
      name: "SEC BEI",
      university: "Pokhara University",
      faculty: "Bachelor in Electronics Engineering",
      level: "Bachelor",
      description: "Shared notes and practice for SEC BEI students.",
      totalYears: 4,
      totalSemesters: 8,
      visibility: "public",
      challengeQuestionFormat: "mcq",
    });
    expect(parsed.success).toBe(true);
  });

  it("requires a known level and falls back to the name for older faculties", () => {
    const base = {
      name: "BEI",
      university: "TU",
      faculty: "BEI",
      totalYears: 1,
      totalSemesters: 1,
      challengeQuestionFormat: "mcq",
    };
    expect(communityInputSchema.safeParse(base).error?.issues[0]?.message).toBe(
      "Choose the level this faculty is for.",
    );
    expect(communityInputSchema.safeParse({ ...base, level: "PhD" }).success).toBe(false);
    const parsed = communityInputSchema.safeParse({ ...base, level: "License" });
    expect(parsed.success && parsed.data.university).toBe("Tribhuvan University");

    expect(communityLevel({ level: "Entrance", name: "MBA", faculty: "" })).toBe("Entrance");
    expect(communityLevel({ level: null, name: "BEI Engineering liscense", faculty: "BEI" })).toBe("License");
    expect(communityLevel({ name: "IOE Entrance Prep", faculty: "Engineering" })).toBe("Entrance");
    expect(communityLevel({ name: "MBA", faculty: "Masters in Business Administration" })).toBe("Master");
    expect(communityLevel({ name: "BCT", faculty: "Bachelor in Computer Engineering" })).toBe("Bachelor");
  });

  it("requires the creator to choose the challenge question type", () => {
    const base = {
      name: "SEC BEI",
      university: "Pokhara University",
      faculty: "BEI",
      level: "Bachelor",
      totalYears: 4,
      totalSemesters: 8,
    };
    const missing = communityInputSchema.safeParse(base);
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0]?.message).toBe("Choose the type of challenge questions students get.");
    expect(communityInputSchema.safeParse({ ...base, challengeQuestionFormat: "essay" }).success).toBe(false);
    for (const format of ["qna", "mcq", "hybrid"]) {
      expect(communityInputSchema.safeParse({ ...base, challengeQuestionFormat: format }).success).toBe(true);
    }
  });

  it("rejects impossible year and semester combinations", () => {
    expect(
      communityInputSchema.safeParse({
        name: "SEC BEI",
        university: "Pokhara University",
        faculty: "BEI",
        totalYears: 4,
        totalSemesters: 3,
      }).success,
    ).toBe(false);
    expect(
      communityInputSchema.safeParse({
        name: "SEC BEI",
        university: "Pokhara University",
        faculty: "BEI",
        totalYears: 4,
        totalSemesters: 20,
      }).success,
    ).toBe(false);
  });

  it("creates URL-safe community slugs", () => {
    expect(communitySlug("  SEC — BEI 2026  ")).toBe("sec-bei-2026");
  });

  it("defaults to the external community while allowing an owned learner workspace", () => {
    const owned = {
      slug: "owned",
      membership: { role: "creator", status: "active" },
    } as const;
    const joined = {
      slug: "joined",
      membership: { role: "member", status: "active" },
    } as const;
    expect(selectStudentCommunity([owned, joined])).toBe(joined);
    expect(selectStudentCommunity([owned])).toBe(owned);
    expect(selectStudentCommunity([owned, joined], "owned")).toBe(owned);
  });

  it("maps membership and counts for catalog cards", () => {
    const community = mapCommunitySummary(
      {
        id: "community-1",
        creator_id: "ram",
        slug: "sec-bei",
        name: "SEC BEI",
        university: "Pokhara University",
        faculty: "BEI",
        total_years: 4,
        total_semesters: 8,
        visibility: "public",
        status: "active",
        created_at: "2026-08-30T00:00:00.000Z",
      },
      12,
      6,
      {
        role: "member",
        status: "active",
        joined_at: "2026-08-30T01:00:00.000Z",
        current_term_id: "semester-2",
      },
    );
    expect(community.memberCount).toBe(12);
    expect(community.subjectCount).toBe(6);
    expect(community.membership?.role).toBe("member");
    expect(community.membership?.currentTermId).toBe("semester-2");
  });
});
