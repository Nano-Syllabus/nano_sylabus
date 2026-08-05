export default function TeachersV2Loading() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[280px_1fr]" aria-label="Loading teacher workspace">
      <aside className="hidden border-r border-border p-6 lg:block">
        <div className="h-10 w-40 animate-pulse rounded-lg bg-bg-secondary motion-reduce:animate-none" />
        <div className="mt-16 space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-lg bg-bg-secondary motion-reduce:animate-none" />
          ))}
        </div>
      </aside>
      <main className="p-5 md:p-8">
        <div className="h-10 w-56 animate-pulse rounded-lg bg-bg-secondary motion-reduce:animate-none" />
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-44 animate-pulse rounded-lg bg-bg-secondary motion-reduce:animate-none" />
          ))}
        </div>
      </main>
    </div>
  );
}
