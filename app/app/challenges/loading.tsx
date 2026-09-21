import {
  ChallengeLoopCard,
  hubContainerClass,
  hubListCardClass,
  hubListHeaderClass,
  hubMainClass,
  hubMetricCardClass,
  hubMetricsClass,
  hubRowActionsClass,
  hubRowClass,
  hubRowMainClass,
  hubRowSubjectClass,
  hubRowsClass,
  hubTitleClass,
} from "@/components/challenge-hub-frame";

/**
 * Only the unknown blocks pulse. The page's real text does not: shimmering a
 * label that is already correct is what makes a half-ready screen look broken.
 *
 * Placeholder fill is `bg-border`, never `bg-bg-secondary`: in the dark theme
 * `--bg-secondary` and `--card` are the same colour, so a `bg-bg-secondary`
 * block inside a card is invisible.
 */
const pulse = "animate-pulse bg-border motion-reduce:animate-none";
const skeleton = `${pulse} rounded`;

/**
 * The Challenge Hub as it will look, drawn from the same frame the hub uses.
 *
 * Everything here that does not depend on a query is real — the heading, the
 * whole Challenge loop card, the three metric labels, the daily target of five,
 * "Available challenges" — and comes from `challenge-hub-frame`, so a redesign of
 * the hub cannot leave this skeleton describing a page that no longer exists
 * (it did: "Weekly Target Progress" and "Available Daily Subtopic Challenges"
 * outlived the hub they belonged to). Only the figures and the rows pulse, and
 * each placeholder takes the size of what replaces it, so nothing moves when the
 * data lands.
 */
export default function ChallengesLoading() {
  return (
    <main className={hubMainClass} aria-busy="true" aria-label="Loading challenges">
      <div className={hubContainerClass}>
        <h1 className={hubTitleClass}>Challenge Hub</h1>

        <ChallengeLoopCard />

        <section className={hubMetricsClass} aria-label="Challenge summary metrics">
          <article className={hubMetricCardClass}>
            <p className="type-student-eyebrow text-[#6b7280] dark:text-text-muted">
              TODAY&apos;S QUOTA
            </p>
            <div className="mt-2 flex items-baseline gap-1.5">
              {/* Today's count is unknown; the target it is out of is not. */}
              <span className={`inline-block h-7 w-8 align-middle ${skeleton}`} />
              <span className="type-student-metric text-[#84cc16]">/ 5</span>
            </div>
            <div
              className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-[#f1f3f5] dark:bg-bg-tertiary"
              aria-hidden="true"
            />
          </article>

          <article className={hubMetricCardClass}>
            <p className="type-student-eyebrow text-[#6b7280] dark:text-text-muted">DAILY TARGET</p>
            {/* A constant, not data: drawn for real. */}
            <p className="type-student-metric mt-2 text-text-primary">5</p>
          </article>

          <article className={hubMetricCardClass}>
            <p className="type-student-eyebrow text-[#6b7280] dark:text-text-muted">
              7-DAY AVERAGE
            </p>
            <div className={`mt-2 h-7 w-16 ${skeleton}`} />
          </article>
        </section>

        <section className={hubListCardClass}>
          <div className={hubListHeaderClass}>
            <h2 className="type-student-section-title text-text-primary">Available challenges</h2>
            {/* Where the Running Semester picker sits for a community with terms. */}
            <div className={`h-9 w-full max-w-[240px] rounded-xl ${pulse}`} />
          </div>

          <div className={hubRowsClass}>
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className={hubRowClass}>
                <div className={hubRowMainClass}>
                  <div className={hubRowSubjectClass}>
                    {/* Subject, then the subtopic under it — the same two lines. */}
                    <div className={`h-5 w-32 ${skeleton}`} />
                    <div className={`mt-2 h-4 w-52 max-w-full ${skeleton}`} />
                  </div>
                  {/* The coverage bar: its caption line, then its track. */}
                  <div className="min-w-0 max-w-[340px] flex-1">
                    <div className={`h-3 w-40 ${skeleton}`} />
                    <div className={`mt-2 h-3 w-full rounded-full ${pulse}`} />
                  </div>
                </div>
                <div className={hubRowActionsClass}>
                  <span className="w-[88px] shrink-0 space-y-1.5">
                    <span className={`ml-auto block h-3.5 w-14 ${skeleton}`} />
                    <span className={`ml-auto block h-2.5 w-16 ${skeleton}`} />
                  </span>
                  <span
                    className={`inline-block min-h-9 w-[104px] shrink-0 rounded-[10px] ${pulse}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
