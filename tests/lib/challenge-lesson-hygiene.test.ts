import { describe, expect, it } from "vitest";
import { lessonParagraphsForTest } from "@/lib/data/student-challenges";

/**
 * A reading is stored once and handed back verbatim for the life of the row, so
 * anything that reaches it is permanent until the row is cleared. That is how a
 * challenge came to open on "GEMINI_API_KEY is not configured…" under the
 * heading "What you need to know".
 */
describe("what may be filed as a student's reading", () => {
  it("drops an operator diagnostic rather than storing it", () => {
    const paragraphs = lessonParagraphsForTest(
      "GEMINI_API_KEY is not configured, so NSDI returned a grounded extractive answer " +
        "from cached/retrieved evidence.\n\nHooke's law states that the restoring force is " +
        "proportional to displacement.",
    );

    expect(paragraphs).toEqual([
      "Hooke's law states that the restoring force is proportional to displacement.",
    ]);
  });

  it("leaves the lesson empty when that is all there was", () => {
    // Empty is a state the app already handles: the screen says the reading is
    // still being written and the background pass fetches it again. Storing
    // nothing and retrying beats storing this and never retrying.
    expect(lessonParagraphsForTest("The API key is not configured.")).toEqual([]);
  });

  it("keeps a real reading untouched", () => {
    const source =
      "Damped oscillation loses energy to friction.\n\nThe amplitude decays exponentially.";
    expect(lessonParagraphsForTest(source)).toEqual([
      "Damped oscillation loses energy to friction.",
      "The amplitude decays exponentially.",
    ]);
  });

  it("does not mistake ordinary physics prose for a diagnostic", () => {
    const source = "A key result is that the configured mass does not change the period.";
    expect(lessonParagraphsForTest(source)).toEqual([source]);
  });
});
