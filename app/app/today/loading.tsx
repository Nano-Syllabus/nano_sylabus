export default function TodayLoading() {
  return (
    <main
      className="min-h-screen w-full bg-bg-primary text-text-primary"
      aria-busy="true"
      aria-label="Loading Daily Dashboard"
    >
      <div className="mx-auto max-w-[1440px] animate-pulse px-4 pb-20 pt-7 motion-reduce:animate-none sm:px-6 lg:px-8">
        <div className="border-b border-border pb-7">
          <div className="h-3 w-28 rounded-full bg-bg-secondary" />
          <div className="mt-4 h-11 max-w-lg rounded-xl bg-bg-secondary" />
          <div className="mt-3 h-5 max-w-md rounded-full bg-bg-secondary" />
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-36 rounded-2xl border border-border bg-card" />
          ))}
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
          <div className="h-[360px] rounded-2xl border border-border bg-card" />
          <div className="h-[360px] rounded-2xl border border-border bg-card" />
        </div>
        <div className="mt-6 h-[300px] rounded-2xl border border-border bg-card" />
      </div>
    </main>
  );
}
