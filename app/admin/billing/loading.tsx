/** Fills only the content area: the admin sidebar (layout) stays on screen. */
export default function AdminBillingLoading() {
  return (
    <div role="status" aria-label="Loading payments" className="motion-safe:animate-pulse">
      <div className="h-8 w-48 rounded bg-border" />
      <div className="mt-3 h-4 w-96 max-w-full rounded bg-border/70" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-[86px] rounded-lg border border-border bg-card" />
        ))}
      </div>
      <div className="mt-6 h-80 rounded-lg border border-border bg-card" />
      <span className="sr-only">Loading payment submissions…</span>
    </div>
  );
}
