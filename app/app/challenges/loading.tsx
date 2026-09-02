export default function ChallengesLoading() {
  return (
    <main
      className="min-h-screen w-full bg-bg-primary text-text-primary"
      aria-busy="true"
      aria-label="Loading challenges"
    >
      <div className="mx-auto max-w-[1160px] animate-pulse px-4 py-8 pb-20 motion-reduce:animate-none sm:px-8">
        <div className="mb-6 h-24 rounded-2xl border border-border bg-bg-secondary" />
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-32 rounded-2xl border border-border bg-card" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 rounded-2xl border border-border bg-card" />
          ))}
        </div>
      </div>
    </main>
  );
}
