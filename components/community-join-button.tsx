"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Users } from "lucide-react";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

export function CommunityJoinButton({
  slug,
  signedIn,
  joined,
}: {
  slug: string;
  signedIn: boolean;
  joined: boolean;
}) {
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  if (joined) {
    return (
      <Link
        href={`/app/communities/${slug}`}
        className={`inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 ${focusRing}`}
      >
        Open community <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    );
  }

  if (!signedIn) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(`/communities/${slug}/join`)}`}
        className={`inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 ${focusRing}`}
      >
        Sign in to join <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    );
  }

  async function join() {
    setJoining(true);
    setError("");
    try {
      const response = await fetch(`/api/communities/${encodeURIComponent(slug)}/join`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error || "Could not join this community. Try again.");
        return;
      }
      router.push(`/flow?community=${encodeURIComponent(slug)}`);
      router.refresh();
    } catch {
      setError("Could not reach NanoSyllabus. Check your connection and try again.");
    } finally {
      setJoining(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={join}
        disabled={joining}
        aria-busy={joining}
        className={`inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
      >
        <Users className="size-4" aria-hidden="true" />
        {joining ? "Joining…" : "Join community"}
      </button>
      {error ? (
        <p role="alert" className="mt-2 max-w-sm text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
