"use client";

import { RefreshCw } from "lucide-react";

export default function CommunityHubError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[65vh] w-full max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-2xl font-semibold">Community Hub could not load</h1>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        Your records are safe. Retry the database request to load the latest community snapshot.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-text-primary px-5 text-sm font-semibold text-text-inverse focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2"
      >
        <RefreshCw className="size-4" aria-hidden="true" /> Retry
      </button>
    </main>
  );
}
