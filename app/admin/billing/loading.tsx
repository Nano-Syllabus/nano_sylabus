export default function AdminBillingLoading() {
  return (
    <main className="min-h-screen bg-muted/45 px-4 py-8 lg:pl-64" role="status" aria-label="Loading payment reviews">
      <div className="mx-auto max-w-7xl motion-safe:animate-pulse">
        <div className="h-8 w-56 rounded bg-muted" />
        <div className="mt-3 h-4 w-96 max-w-full rounded bg-muted" />
        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-32 rounded-lg border border-border bg-card" />)}
        </div>
        <div className="mt-6 h-80 rounded-lg border border-border bg-card" />
      </div>
      <span className="sr-only">Loading real payment submissions…</span>
    </main>
  );
}
