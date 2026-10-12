import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The Challenge Hub's loading skeleton must draw the hub that is actually there.
 *
 * It was a hand-kept copy, and when the hub was redesigned the copy was not: a
 * first visit showed "Weekly Target Progress" and "Available Daily Subtopic
 * Challenges" and then rearranged into a different page. Both now build from
 * `challenge-hub-frame`; these pin that, and pin the labels the skeleton shows
 * for real to the ones the hub prints.
 */
const skeleton = readFileSync("app/app/challenges/loading.tsx", "utf8");
/** What renders, without the comments that explain what used to. */
const rendered = skeleton.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const hub = readFileSync("components/challenges-dashboard-client.tsx", "utf8");
const starterBanner = readFileSync("components/starter-challenge-banner.tsx", "utf8");

const FRAME = [
  "hubMainClass",
  "hubContainerClass",
  "hubTitleClass",
  "hubMetricsClass",
  "hubMetricCardClass",
  "hubListCardClass",
  "hubListHeaderClass",
  "hubRowsClass",
  "hubRowClass",
  "hubRowMainClass",
  "hubRowSubjectClass",
  "hubRowActionsClass",
];

describe("the challenge hub skeleton", () => {
  it("is built from the same frame as the hub", () => {
    for (const piece of FRAME) {
      expect(skeleton, `skeleton does not use ${piece}`).toContain(piece);
      expect(hub, `hub does not use ${piece}`).toContain(piece);
    }
    expect(skeleton).toContain("StarterChallengeBannerSkeleton");
    expect(hub).toContain("StarterChallengeBanner");
  });

  it("shows for real only labels the hub itself prints", () => {
    for (const label of ["TODAY&apos;S QUOTA", "EXAM DAYS REMAINING", "Available challenges", "Micro-Topics Hub"]) {
      expect(skeleton).toContain(label);
      expect(hub).toContain(label);
    }
  });

  it("keeps summary metrics in the requested order in both render paths", () => {
    const expectedOrder = ["EXAM READINESS", "STREAK", "TODAY&apos;S QUOTA", "EXAM DAYS REMAINING"];
    for (const source of [skeleton, hub]) {
      const metricsStart = source.indexOf('aria-label="Challenge summary metrics"');
      const metricsEnd = source.indexOf("</section>", metricsStart);
      const metrics = source.slice(metricsStart, metricsEnd);
      const positions = expectedOrder.map((label) => metrics.indexOf(label));

      expect(positions.every((position) => position >= 0)).toBe(true);
      expect(positions).toEqual([...positions].sort((left, right) => left - right));
    }
  });

  it("no longer describes the hub that was replaced", () => {
    for (const gone of ["Weekly Target Progress", "Avg. Test Score", "Weekly Peer Leaderboard", "Available Daily Subtopic Challenges"]) {
      expect(rendered).not.toContain(gone);
    }
  });

  it("uses the shared theme-aware loading treatment", () => {
    expect(skeleton).toContain("loading-skeleton");
    expect(skeleton).not.toContain("bg-bg-secondary animate-pulse");
  });

  it("does not link the challenge page back to itself", () => {
    expect(starterBanner).not.toContain("Continue challenge");
    expect(starterBanner).not.toContain("Start a challenge");
    expect(starterBanner).not.toContain('href="/app/challenges');
  });
});
