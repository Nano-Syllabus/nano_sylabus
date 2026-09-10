import { Target } from "lucide-react";

/**
 * Only the unknown blocks pulse. The page's real text does not: shimmering a
 * label that is already correct is what makes a half-ready screen look broken.
 */
const skeleton = "animate-pulse rounded bg-border motion-reduce:animate-none";

/**
 * The Challenge Hub's frame, drawn for real.
 *
 * Everything on this screen that does not depend on a query is known before the
 * request starts — the heading, the icon, the three card labels, the section
 * title. Shimmering those throws away information the reader could already be
 * using and makes a half-ready screen look broken.
 *
 * The container must match `ChallengesDashboardClient` exactly (`bg-bg-secondary`,
 * `max-w-7xl`, the same padding and header grid). The previous version used
 * `bg-bg-primary` and `max-w-[1160px]`, so the whole page shifted sideways and
 * changed colour the moment the data landed.
 *
 * Placeholder fill is `bg-border`, never `bg-bg-secondary`: in the dark theme
 * `--bg-secondary` and `--card` are the same colour, so a `bg-bg-secondary`
 * block inside a card is invisible.
 */
export default function ChallengesLoading() {
  return (
    <main
      className="min-h-screen w-full bg-bg-secondary text-text-primary"
      aria-busy="true"
      aria-label="Loading challenges"
    >
      <div className="mx-auto max-w-7xl px-4 py-8 pb-20 md:px-8">
        <header className="mb-8 grid gap-5 border-b border-border pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-end">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-700 dark:text-blue-300">
              <Target className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                Challenge Hub
              </h1>
              {/* Which community is in effect is the one thing here we cannot know yet. */}
              <div className={`mt-2 h-4 w-72 max-w-full ${skeleton}`} />
            </div>
          </div>

          <div className="min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Priority subject
            </span>
            <div className="mt-2 h-11 w-full rounded-lg border border-border bg-card" />
            <div className={`mt-2 h-3 w-44 max-w-full ${skeleton}`} />
          </div>
        </header>

        <section className="mb-6 grid gap-4 md:grid-cols-3" aria-label="Weekly challenge summary">
          {["Weekly Target Progress", "Avg. Test Score", "Weekly Peer Leaderboard"].map((label) => (
            <article key={label} className="rounded-xl border border-border bg-card p-6">
              <p className="text-sm text-text-muted">{label}</p>
              {/* Only the figure is unknown. Its real line-height is reserved so
                  nothing below it moves when the number arrives. */}
              <div className={`mt-2 h-7 w-32 max-w-full ${skeleton}`} />
              <div className={`mt-4 h-2 w-full animate-pulse rounded-full bg-border motion-reduce:animate-none`} />
            </article>
          ))}
        </section>

        <h2 className="text-xl font-semibold">Available Daily Micro-Topic Challenges</h2>
        <div className="mt-4 space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 rounded-2xl border border-border bg-card" />
          ))}
        </div>
      </div>
    </main>
  );
}
