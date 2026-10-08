"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BookOpen, Plus, RefreshCw, X } from "lucide-react";
import {
  communityLevel,
  communitySubjectInputSchema,
  communityTermName,
  type CommunityDetail,
  type CreatorSubjectOption,
} from "@/lib/communities";
import { titleCase } from "@/lib/utils";
import { teacherCommunitySubjectHref, teacherSemesterYear } from "@/lib/teacher-subject-navigation";
import { CommunityTopicExtractionControl } from "@/components/community-topic-extraction-control";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

type LibraryState = "idle" | "loading" | "ready" | "error";

/** Files on each shelf of one subject, from the creator's workspace. */
export type SubjectShelfCounts = { syllabus: number; notes: number; questionBank: number };

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function CommunityStudySpaceClient({
  initialCommunity,
  mode = "student",
  onCreateSubject,
  teacherWorkspaceBaseHref,
  onSubjectAttached,
  shelfCounts,
}: {
  initialCommunity: CommunityDetail;
  mode?: "student" | "teacher";
  onCreateSubject?: (termId: string) => void;
  teacherWorkspaceBaseHref?: string;
  onSubjectAttached?: () => Promise<unknown> | void;
  /** Keyed by the creator subject slug; absent while the workspace loads. */
  shelfCounts?: Record<string, SubjectShelfCounts>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [community, setCommunity] = useState(initialCommunity);
  const selectedTermId =
    mode === "teacher" ? searchParams.get("term") || searchParams.get("attachTerm") || "" : "";
  const [selectedYear, setSelectedYear] = useState(() =>
    teacherSemesterYear(initialCommunity.terms, selectedTermId),
  );
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
  // One term per year (+2 classes, year-wise, Entrance/License) fits on one
  // screen, so every term shows at once; only semester-wise faculties page by year.
  const level = communityLevel(community);
  const oneTermPerYear = community.totalSemesters <= community.totalYears;
  const termName = (term: { yearNumber: number; semesterNumber: number }) =>
    communityTermName({ ...community, level }, term);
  const terms = oneTermPerYear
    ? community.terms
    : community.terms.filter((term) => term.yearNumber === selectedYear);

  useEffect(() => {
    setCommunity(initialCommunity);
  }, [initialCommunity]);
  useEffect(() => {
    if (mode === "teacher")
      setSelectedYear(teacherSemesterYear(initialCommunity.terms, selectedTermId));
  }, [initialCommunity.terms, mode, selectedTermId]);

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
        setNotice(`${attached?.name || "Subject"} attached.`);
        await onSubjectAttached?.();
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not attach the subject.");
        return false;
      } finally {
        setAttachingSlug(null);
      }
    },
    [community.slug, onSubjectAttached],
  );

  useEffect(() => {
    const termId = searchParams.get("term") || "";
    const subjectSlug = searchParams.get("attach") || "";
    if (!canManage || !termId || !subjectSlug) return;
    const key = `${termId}:${subjectSlug}`;
    if (autoAttachKey.current === key) return;
    autoAttachKey.current = key;
    const term = community.terms.find((item) => item.id === termId);
    const cleanedParams = new URLSearchParams(searchParams.toString());
    cleanedParams.delete("attach");
    const returnHref = `${pathname}${cleanedParams.size ? `?${cleanedParams}` : ""}`;
    if (!term) {
      setError("The selected semester no longer exists in this community.");
      router.replace(returnHref, { scroll: false });
      return;
    }
    setSelectedYear(term.yearNumber);
    setAddingToTerm(termId);
    void attachSubject(termId, subjectSlug).finally(() => {
      router.replace(returnHref, { scroll: false });
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
      {oneTermPerYear ? null : (
      <div className="flex flex-wrap gap-2" aria-label="Choose academic year">
        {years.map((year) => (
          <button
            key={year}
            type="button"
            aria-pressed={selectedYear === year}
            onClick={() => {
              setSelectedYear(year);
              closePicker();
              if (mode === "teacher") {
                const params = new URLSearchParams(searchParams.toString());
                const firstTerm = community.terms.find((term) => term.yearNumber === year);
                if (firstTerm) params.set("term", firstTerm.id);
                else params.delete("term");
                window.history.replaceState(null, "", `${pathname}?${params}`);
              }
            }}
            className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium transition ${focusRing} ${selectedYear === year ? "border-text-primary bg-text-primary text-text-inverse" : "border-border bg-bg-primary text-text-secondary hover:bg-bg-secondary"}`}
          >
            Year {year}
          </button>
        ))}
      </div>
      )}

      <div className={`${oneTermPerYear ? "" : "mt-6 "}grid gap-5 lg:grid-cols-2`}>
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
                  {oneTermPerYear ? null : (
                    <p className="mb-2 text-xs font-medium uppercase tracking-widest text-text-muted">
                      Year {term.yearNumber}
                    </p>
                  )}
                  <h2 id={`term-${term.id}`} className="font-display text-xl font-semibold">
                    {termName(term)}
                  </h2>
                  {canManage ? (
                    <p className="mt-1 text-xs text-text-secondary">
                      {term.subjects.length} {term.subjects.length === 1 ? "subject" : "subjects"}
                    </p>
                  ) : null}
                </div>
                {canManage ? (
                  <button
                    type="button"
                    aria-label={`Add subject to ${termName(term)}`}
                    onClick={() => onCreateSubject?.(term.id)}
                    disabled={!onCreateSubject}
                    className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 ${focusRing}`}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    Add subject
                  </button>
                ) : null}
              </div>

              {canManage ? (
                <button
                  type="button"
                  aria-expanded={addingToTerm === term.id}
                  aria-controls={`reuse-${term.id}`}
                  onClick={() => togglePicker(term.id)}
                  className={`mt-2 inline-flex min-h-10 items-center gap-2 rounded-md text-sm text-text-secondary hover:text-text-primary ${focusRing}`}
                >
                  {addingToTerm === term.id ? <X className="size-4" aria-hidden="true" /> : null}
                  {addingToTerm === term.id ? "Close existing subjects" : "Use an existing subject"}
                </button>
              ) : null}

              {addingToTerm === term.id ? (
                <div
                  id={`reuse-${term.id}`}
                  className="mt-2 rounded-lg border border-border bg-bg-secondary p-4"
                >
                  <h3 className="text-sm font-semibold">Add from your subject library</h3>

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
                        Use Add subject to create a new one for {termName(term)}.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {term.subjects.length ? (
                <div className="mt-5 divide-y divide-border border-y border-border">
                  {term.subjects.map((subject) => {
                    const counts =
                      canManage && shelfCounts
                        ? (subject.externalSubjectSlug &&
                            shelfCounts[subject.externalSubjectSlug]) || {
                            syllabus: 0,
                            notes: 0,
                            questionBank: 0,
                          }
                        : null;
                    const missing = counts
                      ? [
                          counts.syllabus ? "" : "a syllabus",
                          counts.questionBank ? "" : "a question bank",
                        ].filter(Boolean)
                      : [];
                    return (
                    <div
                      key={subject.id}
                      className="flex min-h-16 flex-wrap items-center gap-3 py-3"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-bg-secondary">
                        <BookOpen className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-40 flex-1">
                        <span className="block text-sm font-medium">{titleCase(subject.name)}</span>
                        {counts ? (
                          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                            {(
                              [
                                ["Syllabus", counts.syllabus, true],
                                ["Notes", counts.notes, false],
                                ["Question bank", counts.questionBank, true],
                              ] as const
                            ).map(([label, count, required]) => (
                              <span
                                key={label}
                                className={
                                  count
                                    ? "text-text-secondary"
                                    : required
                                      ? "font-medium text-amber-700 dark:text-amber-400"
                                      : "text-text-muted"
                                }
                              >
                                {label} {count}
                              </span>
                            ))}
                            <span className="text-text-muted">
                              {subject.publicationStatus === "published" ? "Published" : "Draft"}
                            </span>
                          </span>
                        ) : (
                          <span className="mt-0.5 block text-xs text-text-muted">
                            {canManage
                              ? [
                                  subject.code,
                                  subject.publicationStatus === "published"
                                    ? "Published · Community members"
                                    : "Draft · Only you",
                                ]
                                  .filter(Boolean)
                                  .join(" · ")
                              : subject.code || "Subject workspace"}
                          </span>
                        )}
                      </div>
                      {canManage && subject.externalSubjectSlug ? (
                        <Link
                          href={teacherCommunitySubjectHref(
                            teacherWorkspaceBaseHref ||
                              `/teachers?view=communities&community=${encodeURIComponent(community.slug)}`,
                            subject.externalSubjectSlug,
                            term.id,
                          )}
                          aria-label={`Open ${titleCase(subject.name)}`}
                          className={`inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-bg-secondary ${focusRing}`}
                        >
                          Open
                          <ArrowRight className="size-4" aria-hidden="true" />
                        </Link>
                      ) : canManage ? (
                        <span className="text-xs text-text-muted">Subject editor unavailable</span>
                      ) : (
                        <ArrowRight
                          className="size-4 text-text-muted transition-transform motion-reduce:transition-none group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      )}
                      {canManage && subject.externalSubjectSlug ? (
                        <CommunityTopicExtractionControl
                          communitySlug={community.slug}
                          subject={subject}
                          onExtracted={onSubjectAttached}
                          blockedReason={
                            missing.length
                              ? `Add ${missing.join(" and ")} to publish ${titleCase(subject.name)}.`
                              : ""
                          }
                        />
                      ) : null}
                    </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-5 rounded-lg border border-dashed border-border p-6 text-center">
                  <BookOpen className="mx-auto size-7 text-text-muted" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium">No subjects yet</p>
                  <p className="mt-1 text-xs leading-5 text-text-muted">
                    {canManage
                      ? `Add the first subject to ${termName(term)}.`
                      : `No subject has been added to ${termName(term)} yet.`}
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
