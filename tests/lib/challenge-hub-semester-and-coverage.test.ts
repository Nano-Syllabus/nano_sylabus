import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/app/challenges",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

import { SubjectCoverage } from "@/components/challenges-dashboard-client";

/**
 * The Challenge Hub owns the running semester now, and says how far through each
 * subject a student is.
 *
 * The running semester is the thing that decides which subjects the queue draws
 * from, so it moved out of the Library to sit beside the queue it changes,
 * replacing the per-subject filter. Each row trades the ids it used to print
 * for the subtopic, and the column the subtopic vacated shows coverage.
 */

describe("the running semester lives on the Challenge Hub", () => {
  const hub = readFileSync("components/challenges-dashboard-client.tsx", "utf8");

  it("offers the semester picker where the subject filter used to be", () => {
    expect(hub).toContain("Running Semester");
    expect(hub).not.toContain("RUNNING SEMESTER");
    expect(hub).toContain('id="running-semester"');
    expect(hub).not.toContain("PRIORITY SUBJECT");
    expect(hub).not.toContain('id="priority-subject"');
  });

  it("saves through the same membership write the Library used to make", () => {
    expect(hub).toContain("/membership`");
    expect(hub).toContain('method: "PATCH"');
    expect(hub).toContain("JSON.stringify({ termId })");
  });

  it("no longer prints the challenge and subject ids under each row", () => {
    expect(hub).not.toContain("Challenge id ");
    expect(hub).not.toContain("Subject id ");
  });
});

describe("a subject's coverage bar", () => {
  const render = (progress?: { covered: number; total: number }) =>
    renderToStaticMarkup(createElement(SubjectCoverage, { progress }));

  it("fills to the share of subtopics with a completed challenge", () => {
    const html = render({ covered: 12, total: 38 });

    expect(html).toContain("12 of 38 subtopics completed");
    expect(html).toContain("32%");
    expect(html).toContain('aria-valuenow="32"');
    expect(html).toContain("width:32%");
  });

  it("is an outlined track with a nub at the start before anything is completed", () => {
    const html = render({ covered: 0, total: 38 });

    expect(html).toContain("0 of 38 subtopics completed");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("border-[#2563eb]/40");
    // Honest at 0%, and still visibly a bar that has begun.
    expect(html).toContain("0%");
    expect(html).toContain("width:0%;min-width:6px");
  });

  it("never prints NaN for a row whose count is missing", () => {
    // Seen as "NaN of 44 subtopics completed · NaN%": a row from a payload that
    // predates `completedTopics` arrives with it undefined.
    const html = render({ covered: undefined as unknown as number, total: 44 });

    expect(html).not.toContain("NaN");
    expect(html).toContain("0 of 44 subtopics completed");
    expect(html).toContain('aria-valuenow="0"');
  });

  it("never overflows when attempts outrun a re-extracted catalogue", () => {
    // A catalogue re-extracted into fewer subtopics can leave more attempted
    // topics than the subject now lists.
    expect(render({ covered: 45, total: 38 })).toContain("100%");
  });

  it("says a subject has no map rather than drawing a bar that reads as nothing done", () => {
    expect(render({ covered: 0, total: 0 })).toContain("Topics not mapped yet");
    expect(render(undefined)).toContain("Topics not mapped yet");
  });
});

describe("the challenge screen, pared back", () => {
  const hub = readFileSync("components/challenges-dashboard-client.tsx", "utf8");

  it("has no Learn / Practice step rail — Previous and Start practising move between them", () => {
    expect(hub).not.toContain('aria-label="Challenge progress"');
    expect(hub).not.toContain("Step {activeStep} of");
    expect(hub).toContain("← Previous");
    expect(hub).toContain('"Start practising →"');
  });

  it("gives focus mode a top bar: Exit left, the topic centred, the clock right", () => {
    expect(hub).toContain("{focusMode ? <span>Exit</span>");
    expect(hub).not.toContain('"Exit focus"');
    const bar = hub.slice(hub.indexOf('aria-label="Challenge"'));
    const markup = bar.slice(0, bar.indexOf("</header>"));
    expect(markup).toContain("sticky top-0");
    expect(markup.indexOf("{focusToggle}")).toBeLessThan(markup.indexOf("{challengeEyebrow}"));
    expect(markup.indexOf("{challengeEyebrow}")).toBeLessThan(markup.indexOf("{timerBox}"));
  });

  it("drops the black topic card — the bar and the title carry what it said", () => {
    expect(hub).not.toContain("own papers have asked on this, answered");
    expect(hub).not.toContain("rounded-2xl bg-text-primary px-5 py-6 text-text-inverse");
  });

  it("logs provenance notes to the console instead of printing them under the step", () => {
    expect(hub).not.toContain('text-warning">{activeWarning}');
    expect(hub).toContain("console.info(`[challenge ${challenge.id}] ${activeWarning}`)");
  });

  it("names an empty semester instead of widening it to every other one", () => {
    expect(hub).toContain("`No ${emptySemesterLabel} subjects yet`");
  });
});

describe("opening and sitting a challenge", () => {
  const hub = readFileSync("components/challenges-dashboard-client.tsx", "utf8");

  it("opens in focus mode, on step one, whatever step it was left on", () => {
    expect(hub).toContain("const [focusMode, setFocusMode] = useState(true);");
    expect(hub).toContain("const incomingStep: ChallengeStep = 1;");
  });

  it("drops the duration beside Start and the remaining-time line under the questions", () => {
    expect(hub).not.toContain("{challenge.durationMinutes} min");
    expect(hub).not.toContain("You have ${timeRemaining} remaining.");
  });

  it("walks practice as questions, then upload, then result, one screen at a time", () => {
    expect(hub).toContain('type PracticeStage = "questions" | "upload" | "result";');
    expect(hub).toContain('practiceStage === "questions" ? (');
    expect(hub).toContain('practiceStage === "upload" && challenge.status !== "completed" ? (');
    expect(hub).toContain('practiceStage === "result" ? (');
    expect(hub).toContain("Upload answers →");
    // A graded sheet lands on its result.
    expect(hub).toContain('setPracticeStage("result");');
  });

  it("asks for the answers on paper, without the file-format small print", () => {
    expect(hub).toContain('"Write your answers on paper."');
    expect(hub).not.toContain("Number answers as Q1, Q2");
  });

  it("keeps the Previous / next bar at the foot of the screen", () => {
    expect(hub).toContain("sticky bottom-0 z-20");
    expect(hub).toContain('<div aria-hidden="true" className="min-h-8 flex-1" />');
  });

  it("uses the same content column in focus mode as outside it", () => {
    expect(hub).toContain('"mx-auto flex min-h-[calc(100dvh-53px)] max-w-5xl flex-col px-4 pt-6 sm:px-8"');
    expect(hub).not.toContain("lg:pl-64 lg:pr-56");
  });
});
