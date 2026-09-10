/**
 * Only the unknown blocks pulse. The page's real text does not: shimmering a
 * label that is already correct is what makes a half-ready screen look broken.
 */
const skeleton = "animate-pulse rounded bg-border motion-reduce:animate-none";

/**
 * The Community Hub's frame, drawn for real.
 *
 * The four section tabs are fixed strings the page always renders, so they show
 * as themselves rather than as four grey bars — the reader can see where they
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
 * for every block, including the six cards.
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
        {["overview", "subjects", "forum", "members"].map((item, index) => (
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

      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-44 rounded-2xl border border-border bg-card p-5">
            <div className={`h-4 w-28 ${skeleton}`} />
            <div className={`mt-4 h-7 w-20 ${skeleton}`} />
          </div>
        ))}
      </div>
    </main>
  );
}
