"use client";

export default function AdminError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-xl px-6 py-24">
    <h1 className="font-display text-3xl font-semibold">Admin dashboard unavailable</h1>
    <p className="mt-4 text-muted-foreground">We could not verify your session or load the dashboard. No metrics are being shown.</p>
    <button type="button" onClick={reset} className="mt-6 min-h-11 rounded-xl bg-foreground px-5 text-background focus-visible:outline-2 focus-visible:outline-offset-4">Try again</button>
  </main>;
}
