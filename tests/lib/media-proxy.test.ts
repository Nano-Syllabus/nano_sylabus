import { describe, expect, it } from "vitest";
import { assertMediaPath } from "@/lib/tenant/media-proxy";

describe("assertMediaPath", () => {
  it("passes through the figure shapes answers actually carry", () => {
    expect(assertMediaPath("figure", ["7437faa845d14df1.png"])).toBe("/api/figure/7437faa845d14df1.png");
    expect(assertMediaPath("figure", ["7437faa845d14df1.png", "status"])).toBe(
      "/api/figure/7437faa845d14df1.png/status",
    );
    expect(assertMediaPath("diagram", ["2cddc2c6d84e35d5.png"])).toBe("/api/diagram/2cddc2c6d84e35d5.png");
  });

  it("maps an animation status onto the one surviving backend route", () => {
    expect(assertMediaPath("media", ["c9c38460e6faad69"])).toBe(
      "/api/v1/media/animations/c9c38460e6faad69",
    );
  });

  it("serves animation assets from the path stored answers name", () => {
    expect(assertMediaPath("media", ["c9c38460", "animation.mp4"])).toBe(
      "/api/media/c9c38460/animation.mp4",
    );
    expect(assertMediaPath("media", ["c9c38460", "poster.png"])).toBe("/api/media/c9c38460/poster.png");
  });

  it("refuses anything that is not a content hash", () => {
    expect(assertMediaPath("media", ["../../v1/admin/dashboard"])).toBeNull();
    expect(assertMediaPath("tikz", ["..", "status"])).toBeNull();
    expect(assertMediaPath("tikz", ["not-hex.png"])).toBeNull();
    expect(assertMediaPath("media", ["ZZZZ"])).toBeNull();
    expect(assertMediaPath("media", ["c9c38460", "etc/passwd"])).toBeNull();
    expect(assertMediaPath("media", ["c9c38460", "evil.mp4"])).toBeNull();
  });

  it("refuses depth it does not serve", () => {
    expect(assertMediaPath("media", [])).toBeNull();
    expect(assertMediaPath("media", ["c9c38460", "poster.png", "extra"])).toBeNull();
    expect(assertMediaPath("tikz", ["abc", "not-status"])).toBeNull();
  });

  it("refuses a hash longer than any digest it issues", () => {
    expect(assertMediaPath("media", ["a".repeat(65)])).toBeNull();
  });
});

describe("the frozen TikZ archive", () => {
  it("still resolves the URLs baked into stored answers", () => {
    // `learned_answers` rows are permanent and replayed verbatim, so every
    // answer written while the TikZ path was live carries one of these.
    expect(assertMediaPath("tikz", ["7437faa845d14df1.m.png"])).toBe(
      "/api/tikz/7437faa845d14df1.m.png",
    );
    expect(assertMediaPath("tikz", ["7437faa845d14df1.png"])).toBe(
      "/api/tikz/7437faa845d14df1.png",
    );
  });

  it("refuses anything that is not a content hash", () => {
    expect(assertMediaPath("tikz", ["../../v1/admin/dashboard"])).toBeNull();
    expect(assertMediaPath("tikz", ["not-hex.png"])).toBeNull();
  });
});

describe("figures drawn from a brief", () => {
  it("addresses a figure and its status by digest", () => {
    expect(assertMediaPath("figure", ["a".repeat(32) + ".png"])).toBe(
      `/api/figure/${"a".repeat(32)}.png`,
    );
    expect(assertMediaPath("figure", ["a".repeat(32) + ".png", "status"])).toBe(
      `/api/figure/${"a".repeat(32)}.png/status`,
    );
  });

  it("refuses a crafted path", () => {
    expect(assertMediaPath("figure", ["../../v1/admin/storage"])).toBeNull();
    expect(assertMediaPath("figure", ["zzzz.png"])).toBeNull();
    expect(assertMediaPath("figure", ["abc", "not-status"])).toBeNull();
  });
});
