import { describe, expect, it } from "vitest";
import { explainerNotes } from "@/lib/concept-explainer-notes";

describe("the topic explainer's brief", () => {
  const reading = [
    "**Why it matters:** Cranes move loads to supports.",
    "**The idea:** Moving a force needs a couple equal to its moment.",
    "### 1. Moving a force",
    "*Slide a push sideways and it turns the body.*",
    '```concept-activity\n{"kind":"choice","title":"x","options":["a","b"],"answer_index":0,"explanation":"y"}\n```',
    "- Add F and -F at O.",
    "$$\nM = F d\n$$",
    "**Worked:** F = 500 N, d = 0.25 m, so M = 125 N m.",
    "### 2. The couple",
    "**Worked:** a second example that is not needed.",
  ];

  it("carries the chapter's spine, never its activities", () => {
    const notes = explainerNotes(reading);
    expect(notes).toContain("Why it matters: Cranes move loads to supports.");
    expect(notes).toContain("The idea: Moving a force needs a couple");
    expect(notes).toContain("Part 1: Moving a force");
    expect(notes).toContain("Part 2: The couple");
    expect(notes).toContain("Formula: M = F d");
    expect(notes).toContain("Worked example: F = 500 N");
    expect(notes).not.toContain("second example");
    expect(notes).not.toContain("concept-activity");
    expect(notes).toContain("90-second explainer");
    expect(notes).toContain("pause and predict");
  });

  it("fits the renderer's 2,000-character notes field", () => {
    const long = Array.from({ length: 200 }, (_, i) => `### ${i + 1}. ${"A long heading ".repeat(4)}`);
    const notes = explainerNotes(long);
    expect(notes.length).toBeLessThanOrEqual(2000);
    expect(notes).toContain("pause and predict"); // the brief survives the cap
  });
});
