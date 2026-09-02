export default function SubjectExplorerLoading() {
  return (
    <main
      className="w-full max-w-[1240px] animate-pulse px-4 py-5 lg:p-7"
      aria-label="Loading Subject Explorer"
    >
      <div className="h-5 w-36 rounded bg-bg-tertiary" />
      <div className="mt-3 h-9 w-64 rounded bg-bg-tertiary" />
      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index}>
            <div className="h-6 w-28 rounded bg-bg-tertiary" />
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="h-52 rounded-xl bg-bg-tertiary" />
              <div className="h-52 rounded-xl bg-bg-tertiary" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
