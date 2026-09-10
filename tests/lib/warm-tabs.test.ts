import { describe, expect, it } from "vitest";
import {
  WARM_ROUTES,
  connectionAllowsWarming,
  routesToWarm,
} from "@/lib/prefetch/warm-tabs";

/**
 * Warming spends a server render per tab on the guess that the student will
 * open it. Both guards here exist so that guess is never made at someone
 * else's expense: not on a metered connection, and never on the page they are
 * already reading.
 */

describe("connectionAllowsWarming", () => {
  it("warms when the browser reports nothing", () => {
    // navigator.connection is Chromium-only. Refusing to warm wherever it is
    // missing would disable this for most desktop browsers on no evidence.
    expect(connectionAllowsWarming(null)).toBe(true);
    expect(connectionAllowsWarming(undefined)).toBe(true);
    expect(connectionAllowsWarming({})).toBe(true);
  });

  it("never warms when the student has asked to save data", () => {
    expect(connectionAllowsWarming({ saveData: true, effectiveType: "4g" })).toBe(false);
  });

  it("does not warm on 2g or 3g", () => {
    for (const effectiveType of ["slow-2g", "2g", "3g"]) {
      expect(connectionAllowsWarming({ effectiveType })).toBe(false);
    }
  });

  it("warms on 4g", () => {
    expect(connectionAllowsWarming({ effectiveType: "4g", saveData: false })).toBe(true);
  });
});

describe("routesToWarm", () => {
  it("skips the tab the student is already on", () => {
    expect(routesToWarm("/app/today")).not.toContain("/app/today");
    expect(routesToWarm("/app/today")).toContain("/app/community");
  });

  it("treats a nested or query-bearing path as still being on that tab", () => {
    // A student reading /app/chat?session=… is on Chat; re-rendering it would
    // cost a round trip to replace what is on screen.
    expect(routesToWarm("/app/chat/some-thread")).not.toContain("/app/chat");
    expect(routesToWarm("/app/community/bct")).not.toContain("/app/community");
  });

  it("warms everything else", () => {
    expect(routesToWarm("/app/notes")).toEqual([...WARM_ROUTES]);
  });

  it("returns the routes in their declared priority order", () => {
    // Today first: it is both the most likely next tab and the one whose data
    // prefetch rides along with it.
    expect(routesToWarm("/app/notes")[0]).toBe("/app/today");
  });
});
