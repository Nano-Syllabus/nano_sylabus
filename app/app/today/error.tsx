"use client";

export default function TodayError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen w-full bg-bg-primary px-4 py-12 text-text-primary sm:px-8">
      <section className="mx-auto max-w-xl rounded-[18px] border border-border bg-card p-6">
        <h1 className="font-display text-2xl font-semibold">Daily Dashboard could not load</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Your learning records are safe. Retry the real database snapshot; no placeholder metrics
          are shown when a source is unavailable.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex min-h-10 items-center rounded-[22px] bg-text-primary px-4 text-sm font-semibold text-text-inverse focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
