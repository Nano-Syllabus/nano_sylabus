import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { daysUntilExam, matchExamSubject } from "@/components/practice-calendar";
import type { DailySemesterSubject } from "@/lib/data/student-daily-dashboard";

const subjects: DailySemesterSubject[] = [
  {
    id: "math",
    slug: "engineering-mathematics",
    name: "Engineering Mathematics",
    code: "MTH",
    topicCount: 8,
    materialCount: 3,
    readiness: 68,
  },
  {
    id: "control",
    slug: "control-systems",
    name: "Control Systems",
    code: "CTL",
    topicCount: 7,
    materialCount: 2,
    readiness: 42,
  },
];

describe("practice calendar exam planning", () => {
  it("links a subject-name exam to its real readiness", () => {
    expect(matchExamSubject("Engineering Mathematics final", subjects)).toEqual(subjects[0]);
    expect(matchExamSubject("Control Systems", subjects)).toEqual(subjects[1]);
  });

  it("does not invent readiness for a custom exam", () => {
    expect(matchExamSubject("Driving licence", subjects)).toBeNull();
  });

  it("calculates calendar-day countdowns without timezone drift", () => {
    expect(daysUntilExam("2026-09-13", "2026-09-13")).toBe(0);
    expect(daysUntilExam("2026-09-26", "2026-09-13")).toBe(13);
  });

  it("keeps month navigation inside the calendar without changing the route", () => {
    const source = readFileSync("components/practice-calendar.tsx", "utf8");

    expect(source).not.toContain("window.history");
    expect(source).not.toContain("router.replace");
    expect(source).not.toContain("router.push");
    expect(source).toContain("setVisibleMonth(month)");
    expect(source).toContain("useCalendarMonth(communitySlug, visibleMonth");
  });

  it("gives the calendar and leaderboard a 60/40 desktop split", () => {
    const source = readFileSync("components/student-daily-dashboard.tsx", "utf8");

    expect(source).not.toContain('className="mt-6 grid gap-6 xl:grid-cols-2"');
    expect(
      source.match(/className="mt-6 grid gap-6 xl:grid-cols-\[minmax\(0,3fr\)_minmax\(0,2fr\)\]"/g),
    ).toHaveLength(2);
  });

  it("uses the available 60% width for readable upcoming-exam rows", () => {
    const source = readFileSync("components/practice-calendar.tsx", "utf8");

    expect(source).toContain("min-w-8 flex-1 overflow-hidden rounded-full");
    expect(source).toContain(
      'className="w-28 shrink-0 text-right whitespace-nowrap text-[12px] font-medium text-slate-500"',
    );
    expect(source).not.toContain("h-1.5 w-24 sm:w-32");
    expect(source).not.toContain("text-[#0066ff] truncate");
  });
});
