"use client";

import Link from "next/link";

export default function CommunityInviteError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-secondary px-4 text-center">
      <section className="w-full max-w-md rounded-3xl border border-border bg-bg-primary p-8">
        <h1 className="font-display text-2xl font-semibold">Invitation could not load</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Retry the request. If it still fails, ask the sender for a new invitation.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="min-h-11 rounded-full bg-text-primary px-5 text-sm font-semibold text-text-inverse focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2"
          >
            Retry
          </button>
          <Link
            href="/communities"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-border px-5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2"
          >
            Browse communities
          </Link>
        </div>
      </section>
    </main>
  );
}
