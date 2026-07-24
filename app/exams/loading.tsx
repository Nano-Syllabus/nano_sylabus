function Skeleton({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse-soft rounded-md bg-bg-secondary motion-reduce:animate-none ${className}`}
    />
  );
}

export default function ExamsLoading() {
  return (
    <div
      className="flex min-h-[100dvh] flex-col bg-bg-primary text-text-primary"
      aria-busy="true"
      aria-label="Loading exam workspace"
    >
      <header className="border-b border-border">
        <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-28" />
            <span aria-hidden="true" className="h-5 w-px bg-border" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="hidden h-7 w-24 sm:block" />
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
        <div className="flex flex-col gap-5 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-72 max-w-full" />
            <Skeleton className="h-4 w-[30rem] max-w-full" />
          </div>
          <Skeleton className="h-11 w-full sm:w-80" />
        </div>

        <div className="grid grid-cols-5 border-b border-border">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="flex min-h-16 items-center justify-center gap-2 px-2"
            >
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="hidden h-4 w-16 sm:block" />
            </div>
          ))}
        </div>

        <section className="mx-auto w-full max-w-4xl py-8">
          <div className="border-b border-border pb-5">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="mt-3 h-4 w-96 max-w-full" />
          </div>

          <div className="grid gap-5 py-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-12 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-12 w-full" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>

          <div className="flex justify-end border-t border-border pt-5">
            <Skeleton className="h-11 w-48" />
          </div>
        </section>
      </main>
    </div>
  );
}
