/**
 * The Challenge Hub's frame: the parts of the page that do not depend on data.
 *
 * Shared by the hub itself (`ChallengesDashboardClient`) and its route skeleton
 * (`app/app/challenges/loading.tsx`). They used to be two hand-kept copies, and
 * when the hub was redesigned the skeleton was not: a first visit drew "Weekly
 * Target Progress" and "Available Daily Subtopic Challenges" — a page that no
 * longer existed — and then rearranged into the real one. Anything here changes
 * in both places at once.
 *
 * No hooks and no "use client": it renders on the server for the skeleton and in
 * the client bundle for the hub.
 */

export const hubMainClass =
  "min-h-screen w-full bg-[#f8f9fa] dark:bg-bg-secondary text-text-primary";
export const hubContainerClass = "mx-auto max-w-[1060px] px-4 sm:px-6 md:px-8 py-8 pb-24";
export const hubTitleClass = "type-student-page-title mb-6 text-text-primary";
export const hubMetricsClass = "mt-6 grid gap-4 md:grid-cols-3";
export const hubMetricCardClass =
  "rounded-[20px] border border-[#e5e7eb] dark:border-border bg-white dark:bg-card p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02)]";
export const hubListCardClass =
  "mt-6 rounded-[24px] border border-[#e5e7eb] dark:border-border bg-white dark:bg-card p-6 sm:p-8 shadow-[0_1px_3px_rgba(0,0,0,0.02)]";
export const hubListHeaderClass =
  "flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#f1f3f5] dark:border-border/60";
export const hubRowsClass = "divide-y divide-[#f1f3f5] dark:divide-border/50";
export const hubRowClass =
  "flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-6 py-5 rounded-xl px-2 -mx-2 transition-colors";
/** Subject and subtopic, then the coverage bar. */
export const hubRowMainClass =
  "flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-8";
export const hubRowSubjectClass = "w-full sm:w-[260px] md:w-[300px] shrink-0 min-w-0";
/** The estimate and the Start / Continue button, fixed widths so they line up. */
export const hubRowActionsClass = "flex items-center justify-between sm:justify-end gap-6 shrink-0";

/** How a challenge works, in three steps. */
export function ChallengeLoopCard() {
  return (
    <section className="challenge-hub-reveal relative overflow-hidden rounded-[24px] border border-black dark:border-white/20 bg-white dark:bg-card p-7 sm:p-9 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
      {/* Top right decorative lime accent corner */}
      <div
        className="pointer-events-none absolute top-0 right-0 size-28 sm:size-34 rounded-bl-full bg-[#d7ff3b] select-none z-0"
        aria-hidden="true"
      />
      {/* Top right badge text */}
      <div className="pointer-events-none absolute top-4 sm:top-5 right-4 sm:right-5 z-10 select-none">
        <span className="type-student-meta font-semibold text-[#0a0a0a]">1 topic · 1 result</span>
      </div>

      <h2 className="type-student-section-title text-text-primary">Challenge loop</h2>

      <div className="relative mt-8">
        {/* Connecting line behind step icons on larger screens */}
        <div
          className="hidden md:block absolute top-[29px] left-[10%] right-[10%] h-[1.5px] bg-[#e5e7eb] dark:bg-border/70 -z-0"
          aria-hidden="true"
        />

        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8">
          {/* Step 1: Learn — the past questions worked, then the concepts.
                One card, because it is one step on the challenge screen; two
                cards here would describe a flow the student never walks. */}
          <div className="challenge-hub-step flex flex-col items-start md:items-center text-left md:text-center">
            <div className="flex size-[58px] items-center justify-center rounded-[16px] border-[1.5px] border-[#18181b] dark:border-white/80 bg-white dark:bg-bg-primary text-black dark:text-white shadow-xs">
              <svg
                className="size-5 text-black dark:text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <h3 className="type-student-card-title mt-3 text-text-primary">Learn</h3>
            <p className="type-student-meta mt-0.5 max-w-[170px] text-[#6b7280] dark:text-text-muted">
              Past questions worked, then the concepts under them.
            </p>
          </div>

          {/* Step 2: Handwritten exam */}
          <div className="challenge-hub-step flex flex-col items-start md:items-center text-left md:text-center">
            <div className="flex size-[58px] items-center justify-center rounded-[16px] border-[1.5px] border-[#18181b] dark:border-white/80 bg-white dark:bg-bg-primary text-black dark:text-white shadow-xs">
              <svg
                className="size-5 text-black dark:text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
            </div>
            <h3 className="type-student-card-title mt-3 text-text-primary">Handwritten exam</h3>
            <p className="type-student-meta mt-0.5 max-w-[170px] text-[#6b7280] dark:text-text-muted">
              Attempt it on your own paper.
            </p>
          </div>

          {/* Step 3: AI grade */}
          <div className="challenge-hub-step flex flex-col items-start md:items-center text-left md:text-center">
            <div className="relative z-10 flex size-[60px] items-center justify-center rounded-[18px] bg-[#18181b] text-[#d7ff3b] shadow-[0_4px_16px_rgba(0,0,0,0.2)] dark:bg-bg-tertiary">
              <svg
                className="size-6 text-[#d7ff3b] fill-current"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
              </svg>
            </div>
            <h3 className="type-student-card-title mt-3 text-text-primary">AI grade</h3>
            <p className="type-student-meta mt-0.5 max-w-[170px] text-[#6b7280] dark:text-text-muted">
              Upload for marks and feedback.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
