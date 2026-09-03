"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Building2, CalendarRange, Plus, Search, Users, X } from "lucide-react";
import {
  communityInputSchema,
  generateCommunityTerms,
  type CommunitySummary,
} from "@/lib/communities";
import { titleCase } from "@/lib/utils";
import { CommunityLeaveControl } from "@/components/community-leave-control";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";
const inputClass = `min-h-11 w-full rounded-xl border border-border bg-surface/70 px-3 text-sm text-foreground placeholder:text-muted-foreground ${focusRing}`;

type Draft = {
  name: string;
  university: string;
  faculty: string;
  description: string;
  totalYears: string;
  totalSemesters: string;
};

const emptyDraft: Draft = {
  name: "",
  university: "",
  faculty: "",
  description: "",
  totalYears: "4",
  totalSemesters: "8",
};

function CommunityCard({
  community,
  signedIn,
}: {
  community: CommunitySummary;
  signedIn: boolean;
}) {
  const router = useRouter();
  const joined = community.membership?.status === "active";
  const creator = joined && community.membership?.role === "creator";
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  async function joinCommunity() {
    setJoining(true);
    setJoinError("");
    try {
      const response = await fetch(`/api/communities/${encodeURIComponent(community.slug)}/join`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setJoinError(payload.error || "Could not join this community. Please try again.");
        return;
      }
      router.push(`/flow?community=${encodeURIComponent(community.slug)}`);
      router.refresh();
    } catch {
      setJoinError("Could not reach NanoSyllabus. Check your connection and try again.");
    } finally {
      setJoining(false);
    }
  }

  return (
    <article className="glass-card group flex min-h-72 flex-col rounded-2xl border border-border p-5 transition-[border-color,transform] duration-200 motion-reduce:transition-none hover:-translate-y-0.5 hover:border-primary/50 motion-reduce:hover:translate-y-0">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Building2 className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold leading-tight text-text-primary">
            {titleCase(community.name)}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">{community.university}</p>
        </div>
      </div>

      <p className="mt-4 line-clamp-2 text-sm leading-6 text-text-secondary">
        {community.description || `${community.faculty} academic community.`}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2 text-xs text-text-secondary">
        <span className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-surface/80 px-3">
          <CalendarRange className="size-4" aria-hidden="true" />
          {community.totalYears} years · {community.totalSemesters} semesters
        </span>
        <span className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-surface/80 px-3">
          <BookOpen className="size-4" aria-hidden="true" />
          {community.subjectCount} subject{community.subjectCount === 1 ? "" : "s"}
        </span>
        <span className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-surface/80 px-3">
          <Users className="size-4" aria-hidden="true" />
          {community.memberCount} member{community.memberCount === 1 ? "" : "s"}
        </span>
        <span className="inline-flex min-h-10 items-center rounded-lg bg-surface/80 px-3">
          {community.faculty}
        </span>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-6">
        {joined ? (
          <Link
            href={
              creator
                ? `/teachers?view=communities&community=${encodeURIComponent(community.slug)}`
                : `/app/communities/${community.slug}`
            }
            className={`inline-flex min-h-10 flex-1 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 ${focusRing}`}
          >
            {creator ? "Open admin workspace" : "Open community"}
          </Link>
        ) : signedIn ? (
          <button
            type="button"
            onClick={joinCommunity}
            disabled={joining}
            aria-busy={joining}
            className={`inline-flex min-h-10 flex-1 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70 ${focusRing}`}
          >
            {joining ? "Joining…" : "Join community"}
          </button>
        ) : (
          <Link
            href={`/login?next=${encodeURIComponent(`/communities/${community.slug}/join`)}`}
            className={`inline-flex min-h-10 flex-1 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 ${focusRing}`}
          >
            Join community
          </Link>
        )}
        {joined ? (
          <span className="inline-flex min-h-10 items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 text-xs font-medium text-emerald-300">
            {creator ? "Creator" : "Joined"}
          </span>
        ) : null}
        <CommunityLeaveControl community={community} />
      </div>
      {joinError ? (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2"
        >
          <p className="text-xs text-destructive">{joinError}</p>
          <button
            type="button"
            onClick={joinCommunity}
            disabled={joining}
            className={`mt-2 min-h-10 text-xs font-semibold text-text-primary underline underline-offset-4 disabled:opacity-70 ${focusRing}`}
          >
            Try again
          </button>
        </div>
      ) : null}
    </article>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="mt-1.5 text-xs text-destructive">
      {message}
    </p>
  ) : null;
}

export function CommunityCatalogClient({
  initialCommunities,
  signedIn,
  initialShowCreate = false,
}: {
  initialCommunities: CommunitySummary[];
  signedIn: boolean;
  initialShowCreate?: boolean;
}) {
  const router = useRouter();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(initialShowCreate);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return initialCommunities;
    return initialCommunities.filter((community) =>
      [community.name, community.university, community.faculty]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [initialCommunities, query]);

  const totalYears = Number.parseInt(draft.totalYears, 10) || 0;
  const totalSemesters = Number.parseInt(draft.totalSemesters, 10) || 0;
  const preview =
    totalYears >= 1 && totalSemesters >= totalYears && totalSemesters <= totalYears * 4
      ? generateCommunityTerms(totalYears, totalSemesters)
      : [];

  function updateDraft(field: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: "" }));
  }

  function openCreate() {
    setShowCreate(true);
    window.setTimeout(() => firstFieldRef.current?.focus(), 0);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setFieldErrors({});
    const parsed = communityInputSchema.safeParse({
      ...draft,
      totalYears,
      totalSemesters,
      visibility: "public",
    });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] || "form");
        if (!errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      const first = parsed.error.issues[0]?.path[0];
      if (first) document.getElementById(`community-${String(first)}`)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        community?: CommunitySummary;
        error?: string;
        field?: string;
      };
      if (!response.ok || !payload.community) {
        if (payload.field)
          setFieldErrors({ [payload.field]: payload.error || "Check this value." });
        else setFormError(payload.error || "Could not create the community. Try again.");
        return;
      }
      router.push(
        `/teachers?view=communities&community=${encodeURIComponent(payload.community.slug)}`,
      );
      router.refresh();
    } catch {
      setFormError("Could not reach NanoSyllabus. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-10 sm:px-6 lg:px-8">
      <header className="hero-glow glass-card flex flex-col items-stretch gap-6 overflow-hidden rounded-3xl border border-border p-6 sm:flex-row sm:items-end sm:p-8">
        <div className="w-full min-w-0 flex-1">
          <p className="text-sm font-medium text-text-secondary">NanoSyllabus communities</p>
          <h1 className="mt-2 max-w-3xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Find the people studying your syllabus
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
            Join your university and faculty community, then study through its years, semesters, and
            subjects.
          </p>
        </div>
        {signedIn ? (
          <button
            type="button"
            onClick={showCreate ? () => setShowCreate(false) : openCreate}
            className={`inline-flex min-h-11 self-start items-center gap-2 whitespace-nowrap rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:ml-auto ${focusRing}`}
          >
            {showCreate ? (
              <X className="size-4" aria-hidden="true" />
            ) : (
              <Plus className="size-4" aria-hidden="true" />
            )}
            {showCreate ? "Close form" : "Create community"}
          </button>
        ) : (
          <Link
            href="/login?next=%2Fcommunities"
            className={`inline-flex min-h-11 self-start items-center gap-2 whitespace-nowrap rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:ml-auto ${focusRing}`}
          >
            <Plus className="size-4" aria-hidden="true" /> Sign in to create
          </Link>
        )}
      </header>

      {showCreate ? (
        <section
          className="glass-card mt-6 rounded-3xl border border-border p-6 sm:p-8"
          aria-labelledby="create-community-title"
        >
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)]">
            <form onSubmit={submit} noValidate aria-busy={submitting}>
              <h2 id="create-community-title" className="font-display text-2xl font-semibold">
                Create a community
              </h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Enter the academic structure once. Semester slots are generated automatically.
              </p>

              {formError ? (
                <div
                  role="alert"
                  className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
                >
                  <p className="text-sm font-medium text-destructive">Could not create community</p>
                  <p className="mt-1 text-sm text-text-secondary">{formError}</p>
                </div>
              ) : null}

              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="community-name" className="text-sm font-medium">
                    Community name <span aria-hidden="true">*</span>
                  </label>
                  <input
                    ref={firstFieldRef}
                    id="community-name"
                    value={draft.name}
                    onChange={(event) => updateDraft("name", event.target.value)}
                    placeholder="SEC BEI"
                    autoComplete="organization"
                    spellCheck={false}
                    aria-invalid={Boolean(fieldErrors.name) || undefined}
                    aria-describedby={fieldErrors.name ? "community-name-error" : undefined}
                    className={`mt-2 ${inputClass}`}
                  />
                  <FieldError id="community-name-error" message={fieldErrors.name} />
                </div>

                <div>
                  <label htmlFor="community-university" className="text-sm font-medium">
                    University <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="community-university"
                    value={draft.university}
                    onChange={(event) => updateDraft("university", event.target.value)}
                    placeholder="Tribhuvan University"
                    autoComplete="organization"
                    aria-invalid={Boolean(fieldErrors.university) || undefined}
                    aria-describedby={
                      fieldErrors.university ? "community-university-error" : undefined
                    }
                    className={`mt-2 ${inputClass}`}
                  />
                  <FieldError id="community-university-error" message={fieldErrors.university} />
                </div>

                <div>
                  <label htmlFor="community-faculty" className="text-sm font-medium">
                    Faculty or programme <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="community-faculty"
                    value={draft.faculty}
                    onChange={(event) => updateDraft("faculty", event.target.value)}
                    placeholder="Bachelor in Electronics Engineering"
                    autoComplete="off"
                    aria-invalid={Boolean(fieldErrors.faculty) || undefined}
                    aria-describedby={fieldErrors.faculty ? "community-faculty-error" : undefined}
                    className={`mt-2 ${inputClass}`}
                  />
                  <FieldError id="community-faculty-error" message={fieldErrors.faculty} />
                </div>

                <div>
                  <label htmlFor="community-totalYears" className="text-sm font-medium">
                    Total years <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="community-totalYears"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={draft.totalYears}
                    onChange={(event) => updateDraft("totalYears", event.target.value)}
                    aria-invalid={Boolean(fieldErrors.totalYears) || undefined}
                    aria-describedby={
                      fieldErrors.totalYears ? "community-years-error" : "community-years-help"
                    }
                    className={`mt-2 ${inputClass}`}
                  />
                  <p id="community-years-help" className="mt-1.5 text-xs text-text-muted">
                    For example, 4 for a four-year degree.
                  </p>
                  <FieldError id="community-years-error" message={fieldErrors.totalYears} />
                </div>

                <div>
                  <label htmlFor="community-totalSemesters" className="text-sm font-medium">
                    Total semesters <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="community-totalSemesters"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={draft.totalSemesters}
                    onChange={(event) => updateDraft("totalSemesters", event.target.value)}
                    aria-invalid={Boolean(fieldErrors.totalSemesters) || undefined}
                    aria-describedby={
                      fieldErrors.totalSemesters
                        ? "community-semesters-error"
                        : "community-semesters-help"
                    }
                    className={`mt-2 ${inputClass}`}
                  />
                  <p id="community-semesters-help" className="mt-1.5 text-xs text-text-muted">
                    For example, 8 for two semesters each year.
                  </p>
                  <FieldError id="community-semesters-error" message={fieldErrors.totalSemesters} />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="community-description" className="text-sm font-medium">
                    Description <span className="font-normal text-text-muted">optional</span>
                  </label>
                  <textarea
                    id="community-description"
                    value={draft.description}
                    onChange={(event) => updateDraft("description", event.target.value)}
                    rows={4}
                    placeholder="Who this community is for and what students will find inside."
                    aria-invalid={Boolean(fieldErrors.description) || undefined}
                    aria-describedby={
                      fieldErrors.description ? "community-description-error" : undefined
                    }
                    className={`mt-2 w-full resize-y rounded-xl border border-border bg-surface/70 px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground ${focusRing}`}
                  />
                  <FieldError id="community-description-error" message={fieldErrors.description} />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                aria-busy={submitting}
                className={`mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
              >
                {submitting ? "Creating community…" : "Create community"}
              </button>
            </form>

            <aside
              className="rounded-2xl border border-border bg-surface/70 p-5"
              aria-live="polite"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                Generated structure
              </p>
              {preview.length ? (
                <div className="mt-4 space-y-4">
                  {Array.from({ length: totalYears }, (_, index) => index + 1).map((year) => (
                    <div key={year}>
                      <h3 className="text-sm font-semibold">Year {year}</h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {preview
                          .filter((term) => term.yearNumber === year)
                          .map((term) => (
                            <span
                              key={term.semesterNumber}
                              className="inline-flex min-h-8 items-center rounded-full border border-border bg-surface-2 px-3 text-xs text-text-secondary"
                            >
                              Semester {term.semesterNumber}
                            </span>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-text-secondary">
                  Enter a valid year and semester count to preview the generated slots.
                </p>
              )}
            </aside>
          </div>
        </section>
      ) : null}

      <section className="pt-10" aria-labelledby="browse-community-title">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <h2 id="browse-community-title" className="font-display text-2xl font-semibold">
              Browse communities
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Public communities can be joined by any signed-in student.
            </p>
          </div>
          <div className="w-full sm:w-80">
            <label htmlFor="community-search" className="text-sm font-medium">
              Search communities
            </label>
            <div className="relative mt-2">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <input
                id="community-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, university, or faculty"
                className={`${inputClass} pl-10`}
              />
            </div>
          </div>
        </div>

        {!initialCommunities.length ? (
          <div className="glass-card mt-6 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center">
            <Building2 className="size-10 text-text-muted" aria-hidden="true" />
            <h3 className="mt-4 font-display text-xl font-semibold">No communities yet</h3>
            <p className="mt-2 max-w-lg text-sm leading-6 text-text-secondary">
              Create the first community for your university and programme.
            </p>
            {signedIn ? (
              <button
                type="button"
                onClick={openCreate}
                className={`mt-5 inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-2 ${focusRing}`}
              >
                <Plus className="size-4" aria-hidden="true" /> Create the first community
              </button>
            ) : null}
          </div>
        ) : !filtered.length ? (
          <div className="glass-card mt-6 flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center">
            <Search className="size-9 text-text-muted" aria-hidden="true" />
            <h3 className="mt-4 font-display text-xl font-semibold">No matching communities</h3>
            <p className="mt-2 text-sm text-text-secondary">
              Try a university, faculty, or shorter community name.
            </p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className={`mt-5 inline-flex min-h-10 items-center rounded-full border border-border px-4 text-sm font-medium hover:bg-surface-2 ${focusRing}`}
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((community) => (
              <CommunityCard key={community.id} community={community} signedIn={signedIn} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
