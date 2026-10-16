import { describe, expect, it } from "vitest";
import { chapterStarts, keywords, parseSrt } from "@/lib/interactive-video";

const SRT = `1
00:00:00,120 --> 00:00:02,000
Real bodies bend a little

2
00:00:12,000 --> 00:00:14,500
so when can we treat a body as rigid

3
00:00:30,000 --> 00:00:32,000
the assumptions for rigid bodies are simple

4
00:00:55,000 --> 00:00:58,000
finally the scope of applied mechanics
`;

describe("interactive video timing", () => {
  it("reads an srt into ordered cues", () => {
    const cues = parseSrt(SRT);
    expect(cues).toHaveLength(4);
    expect(cues[0]).toEqual({ start: 0.12, end: 2, text: "Real bodies bend a little" });
  });

  it("keeps a title's meaningful words only", () => {
    expect(keywords("Assumptions for rigid bodies")).toEqual(["assumptions", "rigid", "bodies"]);
  });

  it("starts each chapter where the narration names it", () => {
    const starts = chapterStarts(
      ["Rigid and deformable bodies", "Assumptions for rigid bodies", "Scope of applied mechanics"],
      parseSrt(SRT),
      60,
    );
    expect(starts).toEqual([0, 30, 55]);
  });

  it("places a chapter the narration never names between its neighbours", () => {
    const starts = chapterStarts(
      ["Rigid and deformable bodies", "Fundamental principles", "Scope of applied mechanics"],
      parseSrt(SRT),
      60,
    );
    expect(starts[0]).toBe(0);
    expect(starts[2]).toBe(55);
    expect(starts[1]).toBeGreaterThan(0);
    expect(starts[1]).toBeLessThan(55);
  });

  it("shares the video evenly without captions", () => {
    expect(chapterStarts(["a", "b", "c", "d"], [], 80)).toEqual([0, 20, 40, 60]);
  });
});
