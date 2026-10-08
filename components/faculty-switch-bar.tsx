"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, ExternalLink, LoaderCircle } from "lucide-react";
import { MAIN_SITE_SLUG, rootDomain } from "@/lib/landing-site-host";

type SiteChoice = { slug: string; name: string; faculties: Array<{ slug: string; name: string }> };

export type FacultySwitch = {
  /** One site for students and site admins; every exam site for a super admin. */
  sites: SiteChoice[];
  siteSlug: string;
  currentSlug: string | null;
  /** A student moves within their site; an admin opens any listed faculty. */
  mode: "student" | "admin";
  /** "Super admin" / "Admin", shown first for admins. */
  roleLabel?: string;
};

const selectClass =
  "min-h-8 cursor-pointer appearance-none rounded-lg border border-border bg-bg-primary py-1 pl-2.5 pr-7 text-xs font-semibold text-text-primary hover:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/40 disabled:opacity-60";

/**
 * "Institute of Engineering → [BCT ▾]". Nobody is locked (user, 2026-10-08): a
 * student switches within their site (POST /api/student/exam-faculty); an admin
 * opens any listed faculty through the join route, which admins pass. A super
 * admin also gets a site dropdown and moves across every subdomain from here.
 */
export function FacultySwitchBar({ sites, siteSlug, currentSlug, mode, roleLabel }: FacultySwitch) {
  const router = useRouter();
  const [site, setSite] = useState(siteSlug);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = sites.find((item) => item.slug === site) ?? sites[0];
  const known = shown.faculties.some((faculty) => faculty.slug === currentSlug);

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

  const siteHost =
    shown.slug === MAIN_SITE_SLUG ? rootDomain() : `${shown.slug}.${rootDomain()}`;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-bg-secondary px-5 py-2 text-xs text-text-secondary">
      {roleLabel ? (
        <span className="rounded-full bg-blue-600/10 px-2 py-0.5 font-medium text-blue-700 dark:text-blue-300">
          {roleLabel}
        </span>
      ) : null}
      {sites.length > 1 ? (
        <Dropdown label="Subdomain" pending={false}>
          <select
            value={shown.slug}
            disabled={pending}
            onChange={(event) => setSite(event.target.value)}
            className={selectClass}
          >
            {sites.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </Dropdown>
      ) : (
        <span>{shown.name}</span>
      )}
      <span aria-hidden="true">→</span>
      <Dropdown label="Faculty" pending={pending}>
        <select
          // Remounts per site so a site without your faculty starts on "Choose".
          key={shown.slug}
          value={known ? (currentSlug ?? "") : ""}
          disabled={pending}
          onChange={(event) => void switchTo(event.target.value)}
          className={selectClass}
        >
          {!known ? (
            <option value="" disabled>
              Choose a faculty
            </option>
          ) : null}
          {shown.faculties.map((faculty) => (
            <option key={faculty.slug} value={faculty.slug}>
              {faculty.name}
            </option>
          ))}
        </select>
      </Dropdown>
      {mode === "admin" && sites.length > 1 ? (
        <a
          href={`https://${siteHost}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-medium text-blue-700 hover:bg-blue-600/10 dark:text-blue-300"
        >
          Open site
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      ) : null}
      {pending ? <span className="text-text-muted">Switching…</span> : null}
      {error ? (
        <span role="alert" className="text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function Dropdown({
  label,
  pending,
  children,
}: {
  label: string;
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{label}</span>
      {children}
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
  );
}
