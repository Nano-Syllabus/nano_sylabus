/**
 * Only the unknown blocks pulse. The page's real text does not: shimmering a
 * label that is already correct is what makes a half-ready screen look broken.
 */
const skeleton = "animate-pulse rounded bg-border motion-reduce:animate-none";

/**
 * The Community Hub's frame, drawn for real.
 *
 * The two section tabs are fixed strings the page always renders, so they show
 * as themselves rather than as grey bars — the reader can see where they
 * have landed while the data is still in flight. What genuinely is not known
 * yet is the community's name, description and counts, and only those are
 * placeheld.
 *
 * The container matches `CommunityHubClient` exactly (`max-w-[1480px]` and the
 * same padding), so nothing shifts when the real page replaces this one.
 *
 * Placeholder fill is `bg-border`, never `bg-bg-secondary`: in the dark theme
 * `--bg-secondary` and `--card` are the same colour, so a `bg-bg-secondary`
 * block inside a card is invisible. The previous version of this file used it
 * for every block, including the six metric cards.
 */
export default function CommunityHubLoading() {
  return (
    <main
      className="mx-auto w-full max-w-[1480px] px-4 pb-20 pt-3 sm:px-6 md:px-8 lg:px-10"
      aria-busy="true"
      aria-label="Loading community hub"
    >
      {/* The hero keeps its real height so the tabs below do not jump. */}
      <div className="mt-5 h-72 rounded-3xl border border-border bg-card p-8">
        <div className={`h-4 w-32 ${skeleton}`} />
        <div className={`mt-4 h-9 w-80 max-w-full ${skeleton}`} />
        <div className={`mt-4 h-4 w-full max-w-2xl ${skeleton}`} />
        <div className={`mt-2 h-4 w-2/3 max-w-xl ${skeleton}`} />
      </div>

      <nav
        className="mt-7 flex gap-6 overflow-x-auto border-b border-border"
        aria-label="Community sections"
      >
        {["overview", "members"].map((item, index) => (
          <span
            key={item}
            className={
              "relative min-h-11 shrink-0 px-1 pb-3 text-sm font-medium capitalize " +
              (index === 0
                ? "text-text-primary after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-border"
                : "text-text-muted")
            }
          >
            {item}
          </span>
        ))}
      </nav>

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <div className="min-w-0">
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-36 rounded-2xl border border-border bg-card p-4 sm:p-5">
                <div className={`h-9 w-9 rounded-xl ${skeleton}`} />
                <div className={`mt-4 h-4 w-28 ${skeleton}`} />
                <div className={`mt-2 h-3 w-24 ${skeleton}`} />
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="h-52 rounded-2xl border border-border bg-card p-5">
                <div className={`h-10 w-10 rounded-xl ${skeleton}`} />
                <div className={`mt-5 h-3 w-28 ${skeleton}`} />
                <div className={`mt-3 h-6 w-48 max-w-full ${skeleton}`} />
                <div className={`mt-3 h-4 w-full ${skeleton}`} />
                <div className={`mt-2 h-4 w-4/5 ${skeleton}`} />
              </div>
            ))}
          </div>
        </div>

        <div className="min-h-[430px] rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className={`h-3 w-20 ${skeleton}`} />
          <div className={`mt-3 h-6 w-56 max-w-full ${skeleton}`} />
          <div className={`mt-2 h-4 w-24 ${skeleton}`} />
          <div className={`mt-6 h-3 w-full ${skeleton}`} />
          <div className="mt-2 space-y-0">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 border-t border-border py-4">
                <div className={`h-3 w-5 ${skeleton}`} />
                <div className={`size-8 rounded-full ${skeleton}`} />
                <div className={`h-4 min-w-0 flex-1 ${skeleton}`} />
                <div className={`h-3 w-8 ${skeleton}`} />
                <div className={`h-3 w-8 ${skeleton}`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
