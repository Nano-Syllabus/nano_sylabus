import { describe, expect, it } from "vitest";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landing-content";
import { applyLandingChanges, describeLandingPath, diffLanding, matchLandingField } from "@/lib/landing-edits";

describe("applyLandingChanges", () => {
  it("sets text, switches and colours, and reports exactly what changed", () => {
    const next = applyLandingChanges(DEFAULT_LANDING_CONTENT, [
      { path: "hero.titleLead", value: "Pass your licence" },
      { path: "prize.hidden", value: "true" },
      { path: "brand.primaryColor", value: "#0F5132" },
      { path: "faq.items.0.answer", value: "Yes." },
    ]);
    expect(next.hero.titleLead).toBe("Pass your licence");
    expect(next.prize.hidden).toBe(true);
    expect(next.brand.primaryColor).toBe("#0f5132");
    expect(next.faq.items[0].answer).toBe("Yes.");
    expect(diffLanding(DEFAULT_LANDING_CONTENT, next).map((change) => change.path).sort()).toEqual(
      ["brand.primaryColor", "faq.items.0.answer", "hero.titleLead", "prize.hidden"],
    );
  });

  it("ignores unknown paths, bad colours and fixed-length list growth", () => {
    const next = applyLandingChanges(DEFAULT_LANDING_CONTENT, [
      { path: "hero.notAField", value: "x" },
      { path: "brand.accentColor", value: "lime" },
      { path: "features.items.9.title", value: "Extra card" },
    ]);
    expect(diffLanding(DEFAULT_LANDING_CONTENT, next)).toEqual([]);
  });

  it("appends a FAQ entry and replaces a whole FAQ list from JSON", () => {
    const length = DEFAULT_LANDING_CONTENT.faq.items.length;
    const appended = applyLandingChanges(DEFAULT_LANDING_CONTENT, [
      { path: `faq.items.${length}.question`, value: "Can I pay with eSewa?" },
      { path: `faq.items.${length}.answer`, value: "Yes." },
    ]);
    expect(appended.faq.items).toHaveLength(length + 1);
    expect(appended.faq.items[length]).toEqual({ question: "Can I pay with eSewa?", answer: "Yes." });

    const replaced = applyLandingChanges(DEFAULT_LANDING_CONTENT, [
      { path: "faq.items", value: JSON.stringify([{ question: "Q", answer: "A" }]) },
    ]);
    expect(replaced.faq.items).toEqual([{ question: "Q", answer: "A" }]);
  });
});

describe("matchLandingField", () => {
  it("finds the field behind clicked text, preferring the clicked section", () => {
    const content = DEFAULT_LANDING_CONTENT;
    expect(matchLandingField(content, "hero", [content.hero.titleHighlight])).toBe("hero.titleHighlight");
    expect(matchLandingField(content, "faq", ["", `${content.faq.items[1].question}\n+`])).toBe("faq.items.1.question");
    // A header button shows the hero's button text.
    expect(matchLandingField(content, "nav", [content.hero.primaryCta])).toBe("hero.primaryCta");
  });
});

describe("describeLandingPath", () => {
  it("names fields in the editor's words", () => {
    expect(describeLandingPath("hero.titleLead")).toBe("Hero · Headline");
    expect(describeLandingPath("prize.hidden")).toBe("Cash prize · Visibility");
    expect(describeLandingPath("faq.items.2.answer")).toMatch(/· 3 · Answer$|Question 3 · Answer$|\d · Answer$/);
  });
});
