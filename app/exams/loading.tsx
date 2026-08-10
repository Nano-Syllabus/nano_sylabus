function Skeleton({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse-soft rounded-md bg-surface/70 motion-reduce:animate-none ${className}`}
    />
  );
}

export default function PublicExamsLoading() {
  return (
    <div
      className="exam-prep-theme min-h-screen bg-background text-foreground"
      aria-busy="true"
      aria-label="Loading exams"
    >
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="hidden items-center gap-7 md:flex">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-14" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      </header>

      <main className="hero-glow">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="mt-7 h-11 w-72 max-w-full" />
          <div className="mt-5 max-w-2xl space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-8/12" />
          </div>
          <Skeleton className="mt-8 h-12 w-full max-w-xl rounded-xl" />
          <div className="mt-5 flex flex-wrap gap-2">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-24 rounded-full" />
            ))}
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="glass-card rounded-2xl border border-border p-5">
                <div className="flex justify-between gap-3">
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="size-4" />
                </div>
                <Skeleton className="mt-8 h-6 w-52 max-w-full" />
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-9/12" />
                </div>
                <div className="mt-14 flex gap-4">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
