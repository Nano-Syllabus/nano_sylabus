"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BookOpen, Library, Plus, RefreshCw, X } from "lucide-react";
import {
  communitySubjectInputSchema,
  type CommunityDetail,
  type CreatorSubjectOption,
} from "@/lib/communities";
import { titleCase } from "@/lib/utils";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

type LibraryState = "idle" | "loading" | "ready" | "error";

export function CommunityStudySpaceClient({
  initialCommunity,
  mode = "student",
  onCreateSubject,
  teacherWorkspaceBaseHref,
}: {
  initialCommunity: CommunityDetail;
  mode?: "student" | "teacher";
  onCreateSubject?: (termId: string) => void;
  teacherWorkspaceBaseHref?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [community, setCommunity] = useState(initialCommunity);
  const [selectedYear, setSelectedYear] = useState(1);
  const [addingToTerm, setAddingToTerm] = useState<string | null>(null);
  const [creatorSubjects, setCreatorSubjects] = useState<CreatorSubjectOption[]>([]);
  const [libraryState, setLibraryState] = useState<LibraryState>("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attachingSlug, setAttachingSlug] = useState<string | null>(null);
  const autoAttachKey = useRef("");
  const canManage = mode === "teacher" && community.canManage;

  const years = useMemo(
    () => Array.from({ length: community.totalYears }, (_, index) => index + 1),
    [community.totalYears],
  );
  const terms = community.terms.filter((term) => term.yearNumber === selectedYear);

  useEffect(() => {
    setCommunity(initialCommunity);
  }, [initialCommunity]);

  const loadCreatorSubjects = useCallback(async () => {
    setLibraryState("loading");
    setError("");
    try {
      const response = await fetch(
        `/api/communities/${encodeURIComponent(community.slug)}/subjects`,
        { headers: { Accept: "application/json" }, cache: "no-store" },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        subjects?: CreatorSubjectOption[];
        error?: string;
      };
      if (!response.ok || !payload.subjects) {
        throw new Error(payload.error || "Could not load Creator Workspace subjects.");
      }
      setCreatorSubjects(payload.subjects);
      setLibraryState("ready");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load Creator Workspace subjects.",
      );
      setLibraryState("error");
    }
  }, [community.slug]);

  const attachSubject = useCallback(
    async (termId: string, subjectSlug: string) => {
      setError("");
      setNotice("");
      const parsed = communitySubjectInputSchema.safeParse({ termId, subjectSlug });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message || "Choose a valid subject and semester.");
        return false;
      }

      setAttachingSlug(subjectSlug);
      try {
        const response = await fetch(
          `/api/communities/${encodeURIComponent(community.slug)}/subjects`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(parsed.data),
          },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          community?: CommunityDetail;
          error?: string;
        };
        if (!response.ok || !payload.community) {
          throw new Error(payload.error || "Could not attach the subject. Try again.");
        }
        setCommunity(payload.community);
        setCreatorSubjects((current) =>
          current.map((subject) =>
            subject.slug === subjectSlug ? { ...subject, attachedTermId: termId } : subject,
          ),
        );
        const attached = payload.community.terms
          .flatMap((term) => term.subjects)
          .find((subject) => subject.externalSubjectSlug === subjectSlug);
        setNotice(`${attached?.name || "Subject"} attached to this semester.`);
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not attach the subject.");
        return false;
      } finally {
        setAttachingSlug(null);
      }
    },
    [community.slug],
  );

  useEffect(() => {
    const termId = searchParams.get("term") || "";
    const subjectSlug = searchParams.get("attach") || "";
    if (!canManage || !termId || !subjectSlug) return;
    const key = `${termId}:${subjectSlug}`;
    if (autoAttachKey.current === key) return;
    autoAttachKey.current = key;
    const term = community.terms.find((item) => item.id === termId);
    if (!term) {
      setError("The selected semester no longer exists in this community.");
      router.replace(pathname, { scroll: false });
      return;
    }
    setSelectedYear(term.yearNumber);
    setAddingToTerm(termId);
    void attachSubject(termId, subjectSlug).finally(() => {
      router.replace(pathname, { scroll: false });
    });
  }, [attachSubject, canManage, community.terms, pathname, router, searchParams]);

  function closePicker() {
    setAddingToTerm(null);
    setError("");
    setNotice("");
  }

  function togglePicker(termId: string) {
    if (addingToTerm === termId) {
      closePicker();
      return;
    }
    setAddingToTerm(termId);
    setError("");
    setNotice("");
    void loadCreatorSubjects();
  }

  return (
    <>
      <div className="flex flex-wrap gap-2" aria-label="Choose academic year">
        {years.map((year) => (
          <button
            key={year}
            type="button"
            aria-pressed={selectedYear === year}
            onClick={() => {
              setSelectedYear(year);
              closePicker();
            }}
            className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium transition ${focusRing} ${selectedYear === year ? "border-text-primary bg-text-primary text-text-inverse" : "border-border bg-bg-primary text-text-secondary hover:bg-bg-secondary"}`}
          >
            Year {year}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {terms.map((term) => {
          const availableSubjects = creatorSubjects.filter((subject) => !subject.attachedTermId);
          return (
            <section
              key={term.id}
              className="rounded-xl border border-border bg-bg-primary p-5"
              aria-labelledby={`term-${term.id}`}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-widest text-text-muted">
                    Year {term.yearNumber}
                  </p>
                  <h2 id={`term-${term.id}`} className="mt-2 font-display text-xl font-semibold">
                    Semester {term.semesterNumber}
                  </h2>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    aria-expanded={addingToTerm === term.id}
                    onClick={() => togglePicker(term.id)}
                    className={`inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-3 text-sm font-medium hover:bg-bg-secondary ${focusRing}`}
                  >
                    {addingToTerm === term.id ? (
                      <X className="size-4" aria-hidden="true" />
                    ) : (
                      <Plus className="size-4" aria-hidden="true" />
                    )}
                    {addingToTerm === term.id ? "Close" : "Add subject"}
                  </button>
                ) : null}
              </div>

              {addingToTerm === term.id ? (
                <div className="mt-5 rounded-lg border border-border bg-bg-secondary p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-bg-primary">
                      <Library className="size-4" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold">Community subject workspace</h3>
                      <p className="mt-1 text-xs leading-5 text-text-secondary">
                        Create a new subject here or attach one you already prepared. Its syllabus,
                        learning map, forum, and challenges remain reusable.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg border border-border bg-bg-primary p-4">
                    <p className="text-sm font-semibold">Create a new subject</p>
                    <p className="mt-1 text-xs leading-5 text-text-secondary">
                      Use the full Creator Workspace flow to add its syllabus, notes, and question
                      bank. The completed subject will attach to Semester {term.semesterNumber}
                      automatically.
                    </p>
                    <button
                      type="button"
                      onClick={() => onCreateSubject?.(term.id)}
                      disabled={!onCreateSubject}
                      className={`mt-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-text-primary px-4 text-sm font-medium text-text-inverse disabled:opacity-50 ${focusRing}`}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      Open subject creator
                    </button>
                  </div>

                  {error ? (
                    <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                      <p role="alert" className="text-sm text-destructive">
                        {error}
                      </p>
                      {libraryState === "error" ? (
                        <button
                          type="button"
                          onClick={() => void loadCreatorSubjects()}
                          className={`mt-2 inline-flex min-h-10 items-center gap-2 text-sm font-medium ${focusRing}`}
                        >
                          <RefreshCw className="size-4" aria-hidden="true" /> Try again
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {notice ? (
                    <p role="status" className="mt-4 text-sm text-success">
                      {notice}
                    </p>
                  ) : null}

                  {libraryState === "loading" ? (
                    <div className="mt-4 space-y-2" aria-label="Loading reusable subjects">
                      {Array.from({ length: 2 }).map((_, index) => (
                        <div
                          key={index}
                          className="h-14 rounded-lg bg-bg-tertiary motion-safe:animate-pulse"
                        />
                      ))}
                    </div>
                  ) : null}

                  {libraryState === "ready" && availableSubjects.length ? (
                    <div className="mt-4">
                      <p className="text-xs font-medium uppercase tracking-widest text-text-muted">
                        Reuse an existing subject
                      </p>
                      <ul className="mt-2 divide-y divide-border border-y border-border">
                        {availableSubjects.map((subject) => (
                          <li key={subject.slug} className="flex min-h-16 items-center gap-3 py-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-bg-primary">
                              <BookOpen className="size-4" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {titleCase(subject.name)}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-text-muted">
                                {subject.code || "Creator Workspace subject"}
                              </span>
                            </span>
                            <button
                              type="button"
                              disabled={Boolean(attachingSlug)}
                              aria-busy={attachingSlug === subject.slug}
                              onClick={() => void attachSubject(term.id, subject.slug)}
                              className={`inline-flex min-h-10 items-center justify-center rounded-full bg-text-primary px-4 text-sm font-medium text-text-inverse disabled:opacity-50 ${focusRing}`}
                            >
                              {attachingSlug === subject.slug ? "Attaching…" : "Attach"}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {libraryState === "ready" && !availableSubjects.length ? (
                    <div className="mt-4 rounded-lg border border-dashed border-border bg-bg-primary p-5 text-center">
                      <BookOpen className="mx-auto size-6 text-text-muted" aria-hidden="true" />
                      <p className="mt-3 text-sm font-medium">No reusable subjects available</p>
                      <p className="mt-1 text-xs leading-5 text-text-muted">
                        Use the subject creator above to build this semester&apos;s first subject.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {term.subjects.length ? (
                <div className="mt-5 divide-y divide-border border-y border-border">
                  {term.subjects.map((subject) => (
                    <div
                      key={subject.id}
                      className="flex min-h-16 flex-wrap items-center gap-3 py-3"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-bg-secondary">
                        <BookOpen className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-40 flex-1">
                        <span className="block text-sm font-medium">{titleCase(subject.name)}</span>
                        <span className="mt-0.5 block text-xs text-text-muted">
                          {canManage
                            ? subject.code || "Community subject workspace"
                            : subject.code || "Subject workspace"}
                        </span>
                      </div>
                      {canManage ? (
                        <Link
                          href={`${teacherWorkspaceBaseHref || `/teachers?view=communities&community=${encodeURIComponent(community.slug)}`}&communitySubject=${encodeURIComponent(subject.slug)}&term=${encodeURIComponent(term.id)}`}
                          className={`inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium hover:bg-bg-secondary ${focusRing}`}
                        >
                          Open {titleCase(subject.name)} workspace
                          <ArrowRight className="size-4" aria-hidden="true" />
                        </Link>
                      ) : (
                        <ArrowRight
                          className="size-4 text-text-muted transition-transform motion-reduce:transition-none group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-lg border border-dashed border-border p-6 text-center">
                  <BookOpen className="mx-auto size-7 text-text-muted" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium">No subjects attached yet</p>
                  <p className="mt-1 text-xs leading-5 text-text-muted">
                    {canManage
                      ? "Use Add subject to create or attach this semester's first subject."
                      : "The community creator has not added a subject to this semester yet."}
                  </p>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
