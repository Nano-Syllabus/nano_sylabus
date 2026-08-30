export default function MyCommunitiesLoading() {
  return (
    <main
      className="w-full max-w-[1240px] animate-pulse px-4 py-5 lg:p-7"
      aria-label="Loading your communities"
    >
      <div className="h-5 w-36 rounded bg-bg-tertiary" />
      <div className="mt-3 h-9 w-64 rounded bg-bg-tertiary" />
      <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-64 rounded-xl bg-bg-tertiary" />
        ))}
      </div>
    </main>
  );
}
