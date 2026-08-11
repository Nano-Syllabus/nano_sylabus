"use client";

import { Button } from "@/components/ui/button";

export default function TeachersV2Error({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-5">
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Creator workspace</p>
      <h1 className="mt-4 font-display text-3xl font-semibold">Couldn&apos;t open your creator workspace</h1>
      <p className="mt-3 leading-7 text-text-secondary">
        Your saved subjects, classrooms, papers, and submissions are safe. Retry the workspace connection.
      </p>
      <Button className="mt-6 w-fit" onClick={reset}>Try again</Button>
    </main>
  );
}
