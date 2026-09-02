export default function CommunityHubLoading() {
  return (
    <main className="mx-auto w-full max-w-[1480px] animate-pulse px-4 pb-20 pt-3 sm:px-6 md:px-8 lg:px-10">
      <div className="h-72 rounded-3xl bg-bg-secondary" />
      <div className="mt-7 h-12 border-b border-border" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-44 rounded-2xl border border-border bg-bg-secondary" />
        ))}
      </div>
    </main>
  );
}
