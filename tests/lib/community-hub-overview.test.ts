import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/community-hub-client.tsx", "utf8");
const page = readFileSync("app/app/community/page.tsx", "utf8");

describe("community hub overview", () => {
  it("shows the programme-wide subject total instead of the current-semester count", () => {
    const totalSubjectsCard = source.slice(
      source.indexOf('label="Total subjects"'),
      source.indexOf('label="Total materials"'),
    );

    expect(totalSubjectsCard).toContain("value={formatNumber(data.subjects.length)}");
    expect(totalSubjectsCard).toContain('detail="Across the full programme"');
    expect(totalSubjectsCard).not.toContain("currentTermSummary.subjectCount");
  });

  it("opens the members section when the full leaderboard link updates the route", () => {
    expect(source).toContain("&tab=members&sort=today#community-members-heading");
    expect(page).toContain('key={`${data.community.id}:${initialSection}:${memberRanking}`}');
  });
});
