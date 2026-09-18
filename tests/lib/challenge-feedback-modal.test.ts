import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChallengeFeedbackModal } from "@/components/challenge-feedback-modal";

describe("the questions asked while a sheet is graded", () => {
  const html = renderToStaticMarkup(
    createElement(ChallengeFeedbackModal, { grading: true, onDone: vi.fn() }),
  );

  it("asks both questions, as buttons only", () => {
    expect(html).toContain("Rate your learning experience for this challenge.");
    expect(html).toContain("What is your expected score for this challenge?");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<textarea");
    expect(html.match(/role="radio"/g)).toHaveLength(9);
  });

  it("has Skip and a disabled Submit, and no close button", () => {
    expect(html).toContain(">Skip</button>");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Submit<\/button>/);
    expect(html.toLowerCase()).not.toContain("close");
    expect(html).not.toContain("×");
  });

  it("is a modal dialog that says the answers are being checked", () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Checking your answers…");
  });

  it("opens when a sheet is submitted, once per sitting", () => {
    const hub = readFileSync("components/challenges-dashboard-client.tsx", "utf8");
    expect(hub).toContain("const sitting = `${challenge.id}:${challenge.attemptCount}`;");
    expect(hub).toContain("<ChallengeFeedbackModal grading={submitting} onDone={finishFeedback} />");
  });
});
