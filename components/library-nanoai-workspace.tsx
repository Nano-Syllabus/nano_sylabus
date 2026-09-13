"use client";

import { ArrowLeft, BookOpen, Download, FileText, LibraryBig, RefreshCw } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CommunityDetail, CommunitySubject, CommunityTerm } from "@/lib/communities";
import type { CommunitySubjectExplorerInsight } from "@/lib/data/community-subject-explorer";
import { SubjectTopicProgress } from "@/components/subject-topic-progress";
import { cn, titleCase } from "@/lib/utils";

export type LibraryNanoAiMaterial = {
  name: string;
  shelf: string;
  path: string;
  indexed: boolean;
  documentId: string;
  sizeBytes: number;
  mimeType?: string;
  previewAvailable?: boolean;
};

export type LibraryNanoAiSubject = Pick<
  CommunitySubject,
  "id" | "slug" | "name" | "code" | "description" | "externalSubjectSlug"
> & { progress?: CommunitySubjectExplorerInsight };

export type LibraryNanoAiSelection = {
  termId: string | null;
  subjectSlug: string | null;
  documentId: string | null;
};

type LoadState = "idle" | "loading" | "ready" | "error";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

function academicLabel(value: number, noun: string) {
  const mod100 = value % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? "th"
      : value % 10 === 1
        ? "st"
        : value % 10 === 2
          ? "nd"
          : value % 10 === 3
            ? "rd"
            : "th";
  return `${value}${suffix} ${noun}`;
}

function formatSize(bytes: number) {
  if (!bytes) return "File";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function materialApiSubject(subject: LibraryNanoAiSubject) {
  return subject.externalSubjectSlug || subject.slug;
}

function updateLibraryUrl(values: {
  semester?: string | null;
  subject?: string | null;
  document?: string | null;
}) {
  const url = new URL(window.location.href);
  const keys = ["semester", "librarySubject", "document"] as const;
  const nextValues = [values.semester, values.subject, values.document];
  keys.forEach((key, index) => {
    const value = nextValues[index];
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  });
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function ExplorerSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading chapters">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-[72px] animate-pulse rounded-2xl bg-bg-secondary motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

function readableMaterialName(name: string) {
  return name
    .replace(/\.(pdf|docx?|pptx?|txt)$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

const SUBJECT_ACCENTS = [
  { tile: "bg-[#eef2ff]", text: "text-[#1d57fd]" },
  { tile: "bg-[#ecfdf3]", text: "text-[#159447]" },
  { tile: "bg-[#f7edff]", text: "text-[#8b3fc7]" },
  { tile: "bg-[#fff4dc]", text: "text-[#ce7a00]" },
  { tile: "bg-[#fff0f0]", text: "text-[#df4242]" },
  { tile: "bg-[#eaf8ff]", text: "text-[#1879a7]" },
] as const;

function SubjectIcon({ index }: { index: number }) {
  const accent = SUBJECT_ACCENTS[index % SUBJECT_ACCENTS.length];
  const glyphs = ["∿", "%", "ⓘ", "‹›", "ϟ", "▧"];
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl text-xl font-semibold",
        accent.tile,
        accent.text,
      )}
    >
      {glyphs[index % glyphs.length]}
    </span>
  );
}

export function LibraryNanoAiWorkspace({
  community,
  insights,
  initialSelection,
  onSubjectSelect,
  onMaterialOpen,
}: {
  community: CommunityDetail | null;
  insights: Record<string, CommunitySubjectExplorerInsight>;
  initialSelection: LibraryNanoAiSelection;
  onSubjectSelect: (subject: LibraryNanoAiSubject) => void;
  onMaterialOpen: (material: LibraryNanoAiMaterial, subject: LibraryNanoAiSubject) => void;
}) {
  const router = useRouter();
  const orderedTerms = useMemo(
    () => [...(community?.terms ?? [])].sort((a, b) => a.position - b.position),
    [community?.terms],
  );
  const currentTerm =
    orderedTerms.find((term) => term.id === community?.membership?.currentTermId) ??
    orderedTerms[0] ??
    null;
  const initialTerm =
    orderedTerms.find((term) => term.id === initialSelection.termId) ?? currentTerm;
  const initialSubject =
    initialTerm?.subjects.find((subject) => subject.slug === initialSelection.subjectSlug) ??
    initialTerm?.subjects[0] ??
    null;
  const [selectedTerm, setSelectedTerm] = useState<CommunityTerm | null>(initialTerm);
  const [selectedSubject, setSelectedSubject] = useState<LibraryNanoAiSubject | null>(
    initialSubject ? { ...initialSubject, progress: insights[initialSubject.id] } : null,
  );
  const [materials, setMaterials] = useState<LibraryNanoAiMaterial[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [restoredDocument, setRestoredDocument] = useState(false);
  const [savingSemester, setSavingSemester] = useState(false);
  const [semesterError, setSemesterError] = useState("");
  const [savedTermId, setSavedTermId] = useState(currentTerm?.id ?? "");
  const semesterSaveInFlight = useRef(false);

  useEffect(() => {
    if (!selectedSubject) {
      setMaterials([]);
      setLoadState("idle");
      return;
    }

    const controller = new AbortController();
    setLoadState("loading");
    setLoadError("");

    async function loadMaterials() {
      try {
        const response = await fetch(
          `/api/student/materials?subject=${encodeURIComponent(materialApiSubject(selectedSubject!))}${community?.studyCourseId ? `&courseId=${encodeURIComponent(community.studyCourseId)}` : ""}`,
          { cache: "no-store", signal: controller.signal },
        );
        const payload = (await response.json().catch(() => null)) as {
          materials?: LibraryNanoAiMaterial[];
          error?: string;
        } | null;
        if (!response.ok) {
          throw new Error(payload?.error || "Could not load this subject's materials.");
        }
        setMaterials(Array.isArray(payload?.materials) ? payload.materials : []);
        setLoadState("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(
          error instanceof Error ? error.message : "Could not load this subject's materials.",
        );
        setLoadState("error");
      }
    }

    void loadMaterials();
    return () => controller.abort();
  }, [community?.studyCourseId, reloadKey, selectedSubject]);

  useEffect(() => {
    if (
      restoredDocument ||
      loadState !== "ready" ||
      !selectedSubject ||
      !initialSelection.documentId
    ) {
      return;
    }

    setRestoredDocument(true);
    const material = materials.find((item) => item.documentId === initialSelection.documentId);
    if (material) onMaterialOpen(material, selectedSubject);
  }, [
    initialSelection.documentId,
    loadState,
    materials,
    onMaterialOpen,
    restoredDocument,
    selectedSubject,
  ]);

  const groupedMaterials = useMemo(() => {
    const groups = new Map<string, LibraryNanoAiMaterial[]>();
    for (const material of materials) {
      const shelf = material.shelf.trim() || "Materials";
      groups.set(shelf, [...(groups.get(shelf) || []), material]);
    }
    return [...groups.entries()];
  }, [materials]);

  const visibleSubjects = useMemo(() => {
    return selectedTerm?.subjects ?? [];
  }, [selectedTerm]);

  const visibleMaterials = materials;

  async function selectTerm(term: CommunityTerm) {
    if (semesterSaveInFlight.current) return;
    setSelectedTerm(term);
    setSelectedSubject(null);
    updateLibraryUrl({ semester: term.id, subject: null, document: null });
    if (community?.membership?.status !== "active" || term.id === savedTermId) {
      return;
    }
    semesterSaveInFlight.current = true;
    setSavingSemester(true);
    setSemesterError("");
    try {
      const response = await fetch(
        `/api/communities/${encodeURIComponent(community.slug)}/membership`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ termId: term.id }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.currentTermId !== term.id) {
        throw new Error(payload.error || "Could not save your current semester.");
      }
      setSavedTermId(term.id);
      router.refresh();
    } catch (error) {
      const savedTerm = orderedTerms.find((item) => item.id === savedTermId) ?? null;
      setSelectedTerm(savedTerm);
      updateLibraryUrl({ semester: savedTerm?.id, subject: null, document: null });
      setSemesterError(
        error instanceof Error ? error.message : "Could not save your current semester.",
      );
    } finally {
      semesterSaveInFlight.current = false;
      setSavingSemester(false);
    }
  }

  function selectSubject(subject: LibraryNanoAiSubject) {
    const subjectWithProgress = { ...subject, progress: insights[subject.id] };
    setSelectedSubject(subjectWithProgress);
    onSubjectSelect(subjectWithProgress);
    updateLibraryUrl({ semester: selectedTerm?.id, subject: subject.slug, document: null });
  }

  if (!community) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="max-w-lg rounded-xl border border-border bg-bg-primary p-8 text-center">
          <LibraryBig className="mx-auto size-9 text-text-muted" aria-hidden="true" />
          <h1 className="mt-4 font-display text-2xl font-semibold">
            Join a community to open your library
          </h1>
          <p className="mt-3 text-sm leading-6 text-text-secondary">
            Library &amp; NanoAI uses the semesters, subjects, and resources from your active
            student community.
          </p>
          <Link
            href="/communities"
            className={cn(
              "mt-6 inline-flex min-h-10 items-center rounded-full bg-text-primary px-5 text-sm font-medium text-text-inverse",
              focusRing,
            )}
          >
            Browse communities
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="font-figma-library mx-auto min-h-full w-full max-w-[1240px] flex-1 bg-bg-primary px-5 pb-12 pt-9 text-text-primary sm:px-8 lg:px-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[32px] font-semibold leading-tight text-text-primary">Library</h1>
            <Image
              src="/figma/library/book-open.svg"
              alt=""
              width={28}
              height={28}
              aria-hidden="true"
            />
          </div>
          <p className="mt-2 text-sm text-text-secondary">
            Choose your semester, subject and chapter to explore resources and study with Nano AI.
          </p>
        </div>
        <div className="flex min-w-[220px] flex-col gap-1.5 sm:items-end">
          <label
            htmlFor="current-semester-selector"
            className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary"
          >
            Choose running semester
          </label>
          <div className="flex h-11 w-full items-center rounded-full border border-border bg-card px-4 sm:w-[220px]">
            <select
              id="current-semester-selector"
              value={savedTermId}
              onChange={(event) => {
                const term = orderedTerms.find((item) => item.id === event.target.value);
                if (term) void selectTerm(term);
              }}
              disabled={savingSemester || orderedTerms.length === 0}
              className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-text-primary outline-none disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Choose running semester"
            >
              {orderedTerms.map((term) => (
                <option key={term.id} value={term.id}>
                  {academicLabel(term.semesterNumber, "Semester")}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <section className="mt-7" aria-labelledby="library-semesters-heading">
        <h2 id="library-semesters-heading" className="text-[17px] font-semibold text-text-primary">
          1. Choose Semester
        </h2>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {orderedTerms.map((term) => {
            const active = selectedTerm?.id === term.id;
            return (
              <button
                key={term.id}
                type="button"
                disabled={savingSemester}
                onClick={() => void selectTerm(term)}
                className={cn(
                  "h-10 shrink-0 rounded-full border px-[18px] text-[13px] font-medium transition-colors",
                  active
                    ? "border-[#1d57fd] bg-card text-[#1d57fd]"
                    : "border-border bg-card text-text-secondary hover:border-border-strong",
                  focusRing,
                )}
              >
                {academicLabel(term.semesterNumber, "Semester")}
              </button>
            );
          })}
        </div>
        {semesterError ? (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {semesterError}
          </p>
        ) : null}
      </section>

      <section className="mt-7" aria-labelledby="library-subjects-heading">
        <div>
          <h2 id="library-subjects-heading" className="text-[17px] font-semibold text-text-primary">
            2. Choose Subject
          </h2>
        </div>
        {selectedTerm && visibleSubjects.length ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {visibleSubjects.map((subject, index) => {
              const active = selectedSubject?.id === subject.id;
              return (
                <button
                  key={subject.id}
                  type="button"
                  onClick={() => selectSubject(subject)}
                  className={cn(
                    "group flex min-h-[96px] w-full items-center rounded-2xl border bg-card p-4 text-left transition-colors sm:w-52",
                    active
                      ? "border-[1.5px] border-[#1d57fd]"
                      : "border-border hover:border-border-strong",
                    focusRing,
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <SubjectIcon index={index} />
                    <span className="line-clamp-2 text-sm font-semibold leading-5 text-text-primary">
                      {titleCase(subject.name)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-border bg-bg-secondary p-6 text-center text-sm text-text-muted">
            {selectedTerm ? "No matching subjects." : "No semesters are available yet."}
          </div>
        )}
      </section>

      <div className="mt-7 grid gap-4 lg:grid-cols-2">
        <section
          className="min-w-0 rounded-2xl border border-border bg-card p-5"
          aria-labelledby="library-resources-heading"
        >
          <h2
            id="library-resources-heading"
            className="text-[17px] font-semibold text-text-primary"
          >
            3. Choose Chapter
          </h2>
          <div className="mt-4">
            {!selectedSubject ? (
              <div className="rounded-2xl bg-bg-secondary px-5 py-6 text-center text-xs text-text-muted">
                Choose a subject to see its uploaded chapters and PDFs.
              </div>
            ) : null}
            {loadState === "loading" ? <ExplorerSkeleton /> : null}
            {loadState === "error" ? (
              <div className="rounded-xl border border-destructive/30 bg-bg-primary p-6">
                <h3 className="font-display text-lg font-semibold">
                  Couldn&apos;t load these resources
                </h3>
                <p className="mt-2 text-sm text-text-secondary">{loadError}</p>
                <button
                  type="button"
                  onClick={() => setReloadKey((current) => current + 1)}
                  className={cn(
                    "mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-text-primary px-4 text-sm font-medium text-text-inverse",
                    focusRing,
                  )}
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  Try again
                </button>
              </div>
            ) : null}
            {loadState === "ready" && materials.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-bg-secondary p-8 text-center">
                <FileText className="mx-auto size-8 text-text-muted" aria-hidden="true" />
                <h3 className="mt-4 font-display text-lg font-semibold">No resources yet</h3>
                <p className="mt-2 text-sm text-text-secondary">
                  The community creator has not uploaded material for this subject yet.
                </p>
              </div>
            ) : null}
            {loadState === "ready" && visibleMaterials.length > 0 ? (
              <ol className="space-y-3">
                {groupedMaterials
                  .flatMap(([, shelfMaterials]) => shelfMaterials)
                  .filter((material) => visibleMaterials.includes(material))
                  .map((material, index) => {
                    const canOpen =
                      Boolean(material.documentId) && material.previewAvailable !== false;
                    return (
                      <li key={`${material.documentId}:${material.path}`}>
                        <button
                          type="button"
                          disabled={!canOpen}
                          onClick={() => {
                            onMaterialOpen(material, selectedSubject!);
                            updateLibraryUrl({
                              semester: selectedTerm!.id,
                              subject: selectedSubject!.slug,
                              document: material.documentId,
                            });
                          }}
                          className={cn(
                            "group flex min-h-20 w-full items-center gap-3 rounded-2xl bg-bg-secondary px-4 py-4 text-left transition-colors hover:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none",
                            focusRing,
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-10 shrink-0 items-center justify-center rounded-[10px] text-xs font-semibold",
                              SUBJECT_ACCENTS[index % SUBJECT_ACCENTS.length].tile,
                              SUBJECT_ACCENTS[index % SUBJECT_ACCENTS.length].text,
                            )}
                          >
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-semibold text-text-primary">
                              {readableMaterialName(material.name)}
                            </span>
                            <span className="mt-1 block truncate text-[13px] text-text-muted">
                              {material.shelf || formatSize(material.sizeBytes)}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "hidden rounded-md px-2 py-1.5 text-[11px] font-medium sm:inline-flex",
                              canOpen
                                ? "bg-[#eaf8ec] text-[#299244]"
                                : "bg-bg-secondary text-text-muted",
                            )}
                          >
                            {canOpen ? "Available" : "Locked"}
                          </span>
                          {!canOpen ? (
                            <Image
                              src="/figma/library/lock.svg"
                              alt=""
                              width={12}
                              height={12}
                              aria-hidden="true"
                            />
                          ) : null}
                          <Image
                            src="/figma/library/chevron-right.svg"
                            alt=""
                            width={16}
                            height={16}
                            aria-hidden="true"
                          />
                        </button>
                      </li>
                    );
                  })}
              </ol>
            ) : null}
          </div>
        </section>
        <section
          className="min-w-0 rounded-2xl border border-border bg-card p-5"
          aria-label="Topic progress for selected subject"
        >
          {selectedSubject ? (
            <SubjectTopicProgress
              insight={insights[selectedSubject.id] ?? selectedSubject.progress}
            />
          ) : (
            <>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
                Topic progress
              </h3>
              <p className="mt-4 rounded-2xl bg-bg-secondary px-5 py-6 text-center text-sm text-text-secondary">
                Choose a subject to see your topic-wise progress.
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

export function LibraryDocumentViewer({
  material,
  subject,
  onBack,
}: {
  material: LibraryNanoAiMaterial;
  subject: LibraryNanoAiSubject;
  onBack: () => void;
}) {
  const [readerState, setReaderState] = useState<LoadState>("loading");
  const [readerError, setReaderError] = useState("");
  const [objectUrl, setObjectUrl] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let nextObjectUrl = "";
    setReaderState("loading");
    setReaderError("");
    setObjectUrl("");

    async function openDocument() {
      try {
        const response = await fetch(
          `/api/student/materials/${encodeURIComponent(material.documentId)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || "This resource could not be opened.");
        }
        const blob = await response.blob();
        nextObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(nextObjectUrl);
        setReaderState("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        setReaderError(
          error instanceof Error ? error.message : "This resource could not be opened.",
        );
        setReaderState("error");
      }
    }

    void openDocument();
    return () => {
      controller.abort();
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [material.documentId, reloadKey]);

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg-secondary/60"
      aria-label="Document reader"
    >
      <header className="flex min-h-16 items-center gap-2 border-b border-border bg-bg-primary px-3 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          className={cn(
            "inline-flex min-h-10 items-center gap-2 rounded-md px-2 text-sm font-medium text-text-secondary hover:bg-bg-secondary hover:text-text-primary",
            focusRing,
          )}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Library
        </button>
        <div className="h-5 w-px bg-border" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{material.name}</p>
          <p className="truncate text-xs text-text-muted">
            {titleCase(subject.name)} · NanoAI active
          </p>
        </div>
        <div className="hidden min-w-32 rounded-lg bg-[color-mix(in_srgb,#1d57fd_9%,var(--bg-primary))] px-3 py-2 sm:block">
          <div className="flex items-center justify-between gap-3 text-[10px] font-medium text-text-muted">
            <span>Subject progress</span>
            <span className="font-semibold text-[#1d57fd]">
              {subject.progress?.readiness === null || subject.progress?.readiness === undefined
                ? "—"
                : `${Math.round(subject.progress.readiness)}%`}
            </span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-card">
            <div
              className="h-full rounded-full bg-[#1d57fd]"
              style={{ width: `${Math.max(0, Math.min(100, subject.progress?.readiness ?? 0))}%` }}
            />
          </div>
        </div>
        <a
          href={`/api/student/materials/${encodeURIComponent(material.documentId)}?download=1`}
          className={cn(
            "inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-bg-secondary",
            focusRing,
          )}
          aria-label={`Download ${material.name}`}
        >
          <Download className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Download</span>
        </a>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden p-3 sm:p-4">
        {readerState === "loading" ? (
          <div
            className="flex h-full flex-col items-center justify-center gap-4"
            aria-live="polite"
          >
            <div className="h-[78%] w-[88%] max-w-3xl animate-pulse rounded-lg bg-bg-primary motion-reduce:animate-none" />
            <p className="text-sm text-text-secondary">Opening {material.name}…</p>
          </div>
        ) : null}
        {readerState === "error" ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-md rounded-xl border border-border bg-bg-primary p-6 text-center">
              <FileText className="mx-auto size-9 text-text-muted" aria-hidden="true" />
              <h2 className="mt-4 font-display text-xl font-semibold">
                Couldn&apos;t open this resource
              </h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">{readerError}</p>
              <button
                type="button"
                onClick={() => setReloadKey((current) => current + 1)}
                className={cn(
                  "mt-5 inline-flex min-h-10 items-center gap-2 rounded-full bg-text-primary px-4 text-sm font-medium text-text-inverse",
                  focusRing,
                )}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                Try again
              </button>
            </div>
          </div>
        ) : null}
        {readerState === "ready" && objectUrl ? (
          <iframe
            src={`${objectUrl}#toolbar=1&navpanes=0&scrollbar=1&zoom=page-fit`}
            title={material.name}
            className="h-full w-full rounded-lg border border-border bg-bg-primary"
          />
        ) : null}
      </div>
    </section>
  );
}
