/**
 * The route-level skeleton, shaped like the page it precedes.
 *
 * This shows for the ~500ms the page shell takes to render, and it is followed
 * by `DashboardDataSkeleton` while the dashboard query lands. Those two have to
 * agree: if this were a generic all-over pulse and the next were a structured
 * one, a student would watch the layout rearrange itself twice before any real
 * content appeared, which reads as the page loading three separate times.
 *
 * So this draws the same frame — the same header, the same six tiles with their
 * real labels, the same two panels with their real titles. What it cannot show
 * is anything derived from the session (the student's name, their access
 * figure), because a `loading.tsx` renders before the page's own data exists.
 * Those appear one step later, and nothing moves when they do.
 */
const LABELS = [
  "Current streak",
  "NanoAI access",
  "XP balance",
  "Challenges / day",
  "Today",
  "Content completeness",
] as const;

/**
 * `bg-border`, not `bg-bg-secondary`.
 *
 * In the dark theme `--bg-secondary` and `--card` are the SAME value (#101010),
 * so a placeholder filled with `bg-bg-secondary` inside a card is exactly the
 * colour of the card — invisible. It only ever looked like a skeleton because
 * the old full-page version sat on `--bg-primary` (#000000) instead.
 *
 * `--border` is a translucent white in dark and a translucent black in light,
 * so it reads against a card and a page in both themes. It is the same token
 * the card outlines use, which are visible in exactly these places.
 */
const shimmer = "animate-pulse rounded-full bg-border motion-reduce:animate-none";

export default function TodayLoading() {
  return (
    <main
      className="mx-auto w-full max-w-[1440px] px-4 pb-20 pt-4 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="Loading Daily Dashboard"
    >
      <header className="border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
          Daily Dashboard
        </p>
        <div className={`mt-3 h-10 w-80 max-w-full ${shimmer}`} />
        <div className={`mt-3 h-4 w-64 max-w-full ${shimmer}`} />
      </header>

      <section
        className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
        aria-label="Daily learning metrics"
      >
        {LABELS.map((label) => (
          <article key={label} className="min-w-0 rounded-2xl border border-border bg-card p-4">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
              {label}
            </span>
            <div className={`mt-5 h-8 w-20 rounded-lg ${shimmer}`} />
            <div className="mt-2 min-h-10">
              <div className={`h-3 w-full ${shimmer}`} />
              <div className={`mt-1.5 h-3 w-2/3 ${shimmer}`} />
            </div>
          </article>
        ))}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-lg font-semibold tracking-tight">Practice calendar</h2>
          <div className={`mt-2 h-3 w-52 ${shimmer}`} />
          <div className="mt-5 grid grid-cols-7 gap-2">
            {Array.from({ length: 35 }).map((_, index) => (
              <div
                key={index}
                className="h-12 animate-pulse rounded-lg bg-border motion-reduce:animate-none"
              />
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Community leaderboard
          </h2>
          <div className={`mt-2 h-3 w-24 ${shimmer}`} />
          <div className="mt-5 space-y-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="size-8 shrink-0 animate-pulse rounded-full bg-border motion-reduce:animate-none" />
                <div className="min-w-0 flex-1">
                  <div className={`h-3 w-32 ${shimmer}`} />
                  <div className={`mt-1.5 h-3 w-16 ${shimmer}`} />
                </div>
                <div className={`h-3 w-8 ${shimmer}`} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
