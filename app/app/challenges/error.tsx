"use client";

export default function ChallengesError({ reset }: { reset: () => void }) {
  return (
    <main className="min-h-screen w-full bg-bg-primary px-4 py-12 text-text-primary sm:px-8">
      <section className="mx-auto max-w-xl rounded-2xl border border-destructive/30 bg-card p-6">
        <h1 className="font-display text-2xl font-semibold">Couldn&apos;t load Challenge Hub</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Your saved progress is safe. This is usually a temporary database or course-content
          connection issue.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex min-h-10 items-center rounded-full bg-text-primary px-4 text-sm font-semibold text-text-inverse focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
