function Skeleton({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse-soft rounded-lg bg-bg-tertiary motion-reduce:animate-none ${className}`}
    />
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-border p-5">
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      </div>
      <div className="mt-5 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>
    </div>
  );
}

export default function TeachersV2Loading() {
  return (
    <div
      className="grid min-h-screen lg:grid-cols-[280px_1fr]"
      role="status"
      aria-label="Loading teacher workspace"
    >
      <aside className="hidden border-r border-border p-6 lg:block">
        <div className="flex items-center gap-3">
          <Skeleton className="h-11 w-11 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
        <div className="mt-16 space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12" />
          ))}
        </div>
      </aside>
      <main className="p-5 md:p-8">
        <div className="mb-8 rounded-xl border border-border bg-bg-primary p-5">
          <p className="font-mono-ui text-xs uppercase tracking-[0.28em] text-text-muted">
            Teacher workspace
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">
            Loading your workspace…
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Checking your teacher session and collection.
          </p>
        </div>
        <div className="flex items-start gap-4">
          <div className="flex-1 space-y-3">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-10 w-72 max-w-full" />
            <Skeleton className="h-4 w-56 max-w-full" />
          </div>
          <Skeleton className="hidden h-12 w-44 sm:block" />
        </div>
        <Skeleton className="mt-8 h-36 rounded-xl" />
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      </main>
    </div>
  );
}
