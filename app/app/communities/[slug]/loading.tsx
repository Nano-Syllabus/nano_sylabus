export default function CommunityStudyLoading() {
  return (
    <main
      className="w-full max-w-[1240px] animate-pulse px-4 py-5 lg:p-7"
      aria-label="Loading community"
    >
      <div className="h-10 w-36 rounded bg-bg-tertiary" />
      <div className="mt-5 h-10 max-w-xl rounded bg-bg-tertiary" />
      <div className="mt-12 grid gap-5 lg:grid-cols-2">
        <div className="h-80 rounded-xl bg-bg-tertiary" />
        <div className="h-80 rounded-xl bg-bg-tertiary" />
      </div>
    </main>
  );
}
