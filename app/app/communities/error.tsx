"use client";

import Link from "next/link";

export default function AppCommunitiesError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="w-full max-w-[900px] px-4 py-10 lg:p-7">
      <section className="rounded-xl border border-destructive/30 bg-bg-primary p-6">
        <h1 className="font-display text-2xl font-semibold">Couldn&apos;t load your communities</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Your membership is safe. Try loading the community list again.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-10 items-center rounded-full bg-text-primary px-4 text-sm font-medium text-text-inverse focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
          >
            Try again
          </button>
          <Link
            href="/app/today"
            className="inline-flex min-h-10 items-center rounded-full border border-border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
          >
            Back to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
