"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, LoaderCircle } from "lucide-react";

export type FacultySwitch = {
  siteName: string;
  faculties: Array<{ slug: string; name: string }>;
  currentSlug: string | null;
  /** A student moves within their exam; an admin opens any listed faculty. */
  mode: "student" | "admin";
  /** "Super admin" / "Admin", shown before the site for admins. */
  roleLabel?: string;
};

/**
 * "Institute of Engineering → [BCT ▾]": the exam site and a dropdown of all its
 * faculties. Nobody is locked (user, 2026-10-08) — a student switches within
 * their exam (POST /api/student/exam-faculty), an admin opens any of the
 * site's faculties (the join route, which admins pass).
 */
export function FacultySwitchBar({ siteName, faculties, currentSlug, mode, roleLabel }: FacultySwitch) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const known = faculties.some((faculty) => faculty.slug === currentSlug);

  async function switchTo(slug: string) {
    if (!slug || slug === currentSlug) return;
    setPending(true);
    setError(null);
    try {
      const response =
        mode === "student"
          ? await fetch("/api/student/exam-faculty", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ facultySlug: slug }),
            })
          : await fetch(`/api/communities/${encodeURIComponent(slug)}/join`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not switch faculty.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not switch faculty.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-bg-secondary px-5 py-2 text-xs text-text-secondary">
      {roleLabel ? (
        <span className="rounded-full bg-blue-600/10 px-2 py-0.5 font-medium text-blue-700 dark:text-blue-300">
          {roleLabel}
        </span>
      ) : null}
      <span>{siteName}</span>
      <span aria-hidden="true">→</span>
      <label className="relative inline-flex items-center">
        <span className="sr-only">Faculty</span>
        <select
          value={known ? (currentSlug ?? "") : ""}
          disabled={pending}
          onChange={(event) => void switchTo(event.target.value)}
          className="min-h-8 cursor-pointer appearance-none rounded-lg border border-border bg-bg-primary py-1 pl-2.5 pr-7 text-xs font-semibold text-text-primary hover:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/40 disabled:opacity-60"
        >
          {!known ? (
            <option value="" disabled>
              Choose a faculty
            </option>
          ) : null}
          {faculties.map((faculty) => (
            <option key={faculty.slug} value={faculty.slug}>
              {faculty.name}
            </option>
          ))}
        </select>
        {pending ? (
          <LoaderCircle
            size={13}
            className="pointer-events-none absolute right-2 animate-spin text-text-muted"
            aria-hidden="true"
          />
        ) : (
          <ChevronDown
            size={13}
            className="pointer-events-none absolute right-2 text-text-muted"
            aria-hidden="true"
          />
        )}
      </label>
      {pending ? <span className="text-text-muted">Switching…</span> : null}
      {error ? (
        <span role="alert" className="text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
