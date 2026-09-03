"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

export function CommunityJoinRedirect({ slug }: { slug: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [joining, setJoining] = useState(true);
  const [error, setError] = useState("");

  const join = useCallback(async () => {
    setJoining(true);
    setError("");
    try {
      const response = await fetch(`/api/communities/${encodeURIComponent(slug)}/join`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error || "Could not join this community. Please try again.");
        setJoining(false);
        return;
      }
      router.replace(`/flow?community=${encodeURIComponent(slug)}`);
      router.refresh();
    } catch {
      setError("Could not reach NanoSyllabus. Check your connection and try again.");
      setJoining(false);
    }
  }, [router, slug]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void join();
  }, [join]);

  return (
    <main className="exam-prep-theme hero-glow flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <section className="glass-card w-full max-w-md rounded-3xl border border-border p-7 text-center sm:p-9">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Building2 className="size-6" aria-hidden="true" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-semibold">
          {joining ? "Joining community…" : "Could not join community"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          {joining
            ? "Saving your membership and opening your community."
            : error}
        </p>
        {!joining && error ? (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => void join()}
              className={`inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 ${focusRing}`}
            >
              Try again
            </button>
            <Link
              href="/communities"
              className={`inline-flex min-h-11 items-center justify-center rounded-full border border-border px-5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface ${focusRing}`}
            >
              Browse communities
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}
