export default function TodayLoading() {
  return (
    <main className="min-h-screen w-full bg-bg-primary text-text-primary" aria-busy="true" aria-label="Loading challenges">
      <div className="mx-auto max-w-[1160px] animate-pulse px-4 py-8 pb-20 motion-reduce:animate-none sm:px-8">
        <div className="mb-[30px] h-28 rounded-[15px] border border-border bg-bg-secondary" />
        <div className="mb-6 grid grid-cols-1 gap-[18px] lg:grid-cols-[1.55fr_.9fr]">
          <div className="h-[420px] rounded-[18px] border border-border bg-card" />
          <div className="h-[420px] rounded-[18px] border border-border bg-card" />
        </div>
        <div className="mb-7 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-32 rounded-[15px] border border-border bg-card" />
          ))}
        </div>
        <div className="h-28 rounded-[16px] border border-border bg-card" />
      </div>
    </main>
  );
}
