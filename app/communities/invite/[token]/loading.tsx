export default function CommunityInviteLoading() {
  return (
    <main className="min-h-screen animate-pulse bg-bg-secondary px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="h-9 w-44 rounded-lg bg-border" />
        <div className="mt-12 overflow-hidden rounded-3xl border border-border bg-bg-primary">
          <div className="h-56 bg-border" />
          <div className="space-y-7 p-6 sm:p-10">
            <div className="grid gap-5 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-20 rounded-xl bg-bg-secondary" />
              ))}
            </div>
            <div className="h-12 rounded-xl bg-border" />
          </div>
        </div>
      </div>
    </main>
  );
}
