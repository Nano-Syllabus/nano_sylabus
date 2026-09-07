"use client";

import { useId, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import type { CommunitySwitchOption } from "@/lib/community-switch";

export function CommunitySwitcher({
  options,
  selectedSlug,
}: {
  options: CommunitySwitchOption[];
  selectedSlug: string;
}) {
  const id = useId();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  if (!options.length) return null;
  const canSwitch = options.length > 1;

  function switchCommunity(slug: string) {
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/student/active-community", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Could not switch communities. Try again.");
        // Drop the previous community's filters and reset its client state.
        router.replace(`${pathname}?community=${encodeURIComponent(result.slug)}`);
        router.refresh();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Could not switch communities. Try again.",
        );
      }
    });
  }

  return (
    <div className="w-full sm:max-w-sm">
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-semibold uppercase tracking-wide text-text-muted"
      >
        {canSwitch ? "Switch community" : "Current community"}
      </label>
      <select
        id={id}
        value={selectedSlug}
        disabled={pending || !canSwitch}
        aria-busy={pending}
        onChange={(event) => switchCommunity(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-border bg-bg-primary px-3 text-sm font-semibold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={option.slug} value={option.slug}>
            {option.name} · {option.owned ? "Your community" : "Joined"}
          </option>
        ))}
      </select>
      {!canSwitch ? (
        <p className="mt-2 text-xs text-text-muted">
          Your other owned or joined communities will appear here.
        </p>
      ) : null}
      {pending ? (
        <p role="status" className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
          <LoaderCircle
            className="size-4 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          Loading community…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
