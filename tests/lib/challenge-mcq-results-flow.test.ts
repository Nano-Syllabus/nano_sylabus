import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("components/challenge-mcq-page.tsx", "utf8");
const fundamentals = readFileSync("components/challenge-fundamentals.tsx", "utf8");

describe("MCQ result flow", () => {
  it("submits automatically after the final answer instead of asking for another click", () => {
    expect(page).toContain("questions.every((question) => nextChecked[question.id])");
    expect(page).toContain("void submit(nextChecked)");
    expect(page).not.toContain("See your score");
  });

  it("keeps reviewed questions above the result card", () => {
    expect(page).toContain('className="order-1 space-y-4"');
    expect(page).toContain('"order-2 mt-6 rounded-xl border p-5"');
  });

  it("shows exactly the action appropriate to the result and scrolls upward", () => {
    expect(page).toContain("{result.passed ? (");
    expect(page).toContain("Retake exam");
    expect(page).toContain("{nextLabel}");
    expect(page).toContain('window.scrollTo({ top: 0, behavior: "smooth" })');
  });

  it("offers a compact hint beside a wrong question in live and reviewed results", () => {
    expect(fundamentals).toContain('label = "Hint"');
    expect(fundamentals).toContain("<Lightbulb");
    expect(page.match(/besideQuestion/g)).toHaveLength(2);
    expect(page).not.toContain("Why? Understand it with a video");
  });
});
