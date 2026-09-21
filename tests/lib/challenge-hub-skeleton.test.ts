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

const FRAME = [
  "ChallengeLoopCard",
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
  });

  it("shows for real only labels the hub itself prints", () => {
    for (const label of ["TODAY&apos;S QUOTA", "DAILY TARGET", "7-DAY AVERAGE", "Available challenges", "Challenge Hub"]) {
      expect(skeleton).toContain(label);
      expect(hub).toContain(label);
    }
  });

  it("no longer describes the hub that was replaced", () => {
    for (const gone of ["Weekly Target Progress", "Avg. Test Score", "Weekly Peer Leaderboard", "Available Daily Subtopic Challenges"]) {
      expect(rendered).not.toContain(gone);
    }
  });

  it("pulses only with a fill that shows in both themes", () => {
    expect(skeleton).toContain("animate-pulse bg-border");
    expect(skeleton).not.toContain("bg-bg-secondary animate-pulse");
  });
});
