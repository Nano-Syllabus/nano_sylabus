"use client";

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Download,
  FileText,
  FolderOpen,
  LibraryBig,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CommunityDetail, CommunitySubject, CommunityTerm } from "@/lib/communities";
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
>;

export type LibraryNanoAiSelection = {
  termId: string | null;
  subjectSlug: string | null;
  documentId: string | null;
};

type LoadState = "idle" | "loading" | "ready" | "error";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

const ORDINALS = [
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
  "Eighth",
  "Ninth",
  "Tenth",
];

function academicLabel(value: number, noun: string) {
  return `${ORDINALS[value - 1] || noun} ${ORDINALS[value - 1] ? noun : value}`;
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
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading materials">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-24 animate-pulse rounded-xl bg-bg-secondary motion-reduce:animate-none" />
      ))}
    </div>
  );
}

function SemesterCard({
  term,
  onSelect,
}: {
  term: CommunityTerm;
  onSelect: (term: CommunityTerm) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(term)}
      className={cn(
        "group w-full rounded-xl border border-border bg-bg-primary p-4 text-left transition-colors hover:border-border-strong hover:bg-bg-secondary motion-reduce:transition-none",
        focusRing,
      )}
    >
      <div className="relative mt-3 aspect-[5/3] rounded-xl border border-border bg-bg-secondary p-5">
        <span
          className="absolute -top-3 left-5 h-4 w-20 rounded-t-lg border border-b-0 border-border bg-bg-secondary"
          aria-hidden="true"
        />
        <div className="flex h-full items-center justify-center gap-2 text-text-muted">
          <FileText className="size-7 -rotate-6" aria-hidden="true" />
          <FolderOpen className="size-11 text-text-secondary" aria-hidden="true" />
          <BookOpen className="size-7 rotate-6" aria-hidden="true" />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-semibold text-text-primary">
            {academicLabel(term.semesterNumber, "Semester")}
          </h3>
          <p className="mt-1 text-sm text-text-secondary">
            {term.subjects.length} {term.subjects.length === 1 ? "subject" : "subjects"}
          </p>
        </div>
        <ArrowRight
          className="size-4 text-text-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </div>
    </button>
  );
}

export function LibraryNanoAiWorkspace({
  community,
  initialSelection,
  onSubjectSelect,
  onMaterialOpen,
}: {
  community: CommunityDetail | null;
  initialSelection: LibraryNanoAiSelection;
  onSubjectSelect: (subject: LibraryNanoAiSubject) => void;
  onMaterialOpen: (material: LibraryNanoAiMaterial, subject: LibraryNanoAiSubject) => void;
}) {
  const initialTerm = community?.terms.find((term) => term.id === initialSelection.termId) ?? null;
  const initialSubject =
    initialTerm?.subjects.find((subject) => subject.slug === initialSelection.subjectSlug) ?? null;
  const [selectedTerm, setSelectedTerm] = useState<CommunityTerm | null>(initialTerm);
  const [selectedSubject, setSelectedSubject] = useState<LibraryNanoAiSubject | null>(initialSubject);
  const [materials, setMaterials] = useState<LibraryNanoAiMaterial[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [restoredDocument, setRestoredDocument] = useState(false);

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
          `/api/student/materials?subject=${encodeURIComponent(materialApiSubject(selectedSubject!))}`,
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
        setLoadError(error instanceof Error ? error.message : "Could not load this subject's materials.");
        setLoadState("error");
      }
    }

    void loadMaterials();
    return () => controller.abort();
  }, [reloadKey, selectedSubject]);

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
  }, [initialSelection.documentId, loadState, materials, onMaterialOpen, restoredDocument, selectedSubject]);

  const groupedMaterials = useMemo(() => {
    const groups = new Map<string, LibraryNanoAiMaterial[]>();
    for (const material of materials) {
      const shelf = material.shelf.trim() || "Materials";
      groups.set(shelf, [...(groups.get(shelf) || []), material]);
    }
    return [...groups.entries()];
  }, [materials]);

  function selectTerm(term: CommunityTerm) {
    setSelectedTerm(term);
    setSelectedSubject(null);
    updateLibraryUrl({ semester: term.id, subject: null, document: null });
  }

  function selectSubject(subject: LibraryNanoAiSubject) {
    setSelectedSubject(subject);
    onSubjectSelect(subject);
    updateLibraryUrl({ semester: selectedTerm?.id, subject: subject.slug, document: null });
  }

  if (!community) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="max-w-lg rounded-xl border border-border bg-bg-primary p-8 text-center">
          <LibraryBig className="mx-auto size-9 text-text-muted" aria-hidden="true" />
          <h1 className="mt-4 font-display text-2xl font-semibold">Join a community to open your library</h1>
          <p className="mt-3 text-sm leading-6 text-text-secondary">
            Library &amp; NanoAI uses the semesters, subjects, and resources from your active student community.
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
    <main className="mx-auto w-full max-w-[1240px] px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      <header className="border-b border-border pb-7">
        <p className="text-xs font-medium uppercase tracking-widest text-text-muted">
          Library &amp; NanoAI
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
          {selectedSubject
            ? titleCase(selectedSubject.name)
            : selectedTerm
              ? `${academicLabel(selectedTerm.semesterNumber, "Semester")} subjects`
              : "Your learning library"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
          {selectedSubject
            ? "Open a resource to read it beside NanoAI."
            : selectedTerm
              ? "Choose a subject to see the resources shared by your community creator."
              : "Choose a semester, then open a subject and study its real community resources with NanoAI."}
        </p>
        <p className="mt-4 text-sm font-medium text-text-secondary">
          {titleCase(community.name)} · {community.university}
        </p>
      </header>

      {selectedTerm ? (
        <button
          type="button"
          onClick={() => {
            if (selectedSubject) {
              setSelectedSubject(null);
              updateLibraryUrl({ semester: selectedTerm.id, subject: null, document: null });
            } else {
              setSelectedTerm(null);
              updateLibraryUrl({ semester: null, subject: null, document: null });
            }
          }}
          className={cn(
            "mt-5 inline-flex min-h-10 items-center gap-2 rounded-md text-sm font-medium text-text-secondary hover:text-text-primary",
            focusRing,
          )}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {selectedSubject ? academicLabel(selectedTerm.semesterNumber, "Semester") : "All semesters"}
        </button>
      ) : null}

      {!selectedTerm ? (
        <section className="py-8" aria-labelledby="library-semesters-heading">
          <h2 id="library-semesters-heading" className="font-display text-xl font-semibold">
            Semesters
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {community.terms.map((term) => (
              <SemesterCard key={term.id} term={term} onSelect={selectTerm} />
            ))}
          </div>
        </section>
      ) : !selectedSubject ? (
        <section className="py-8" aria-labelledby="library-subjects-heading">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="library-subjects-heading" className="font-display text-xl font-semibold">
              Available subjects
            </h2>
            <span className="text-sm text-text-muted">{selectedTerm.subjects.length} available</span>
          </div>
          {selectedTerm.subjects.length ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {selectedTerm.subjects.map((subject) => (
                <button
                  key={subject.id}
                  type="button"
                  onClick={() => selectSubject(subject)}
                  className={cn(
                    "group flex min-h-48 flex-col rounded-xl border border-border bg-bg-primary p-5 text-left transition-colors hover:border-border-strong hover:bg-bg-secondary motion-reduce:transition-none",
                    focusRing,
                  )}
                >
                  <span className="flex size-11 items-center justify-center rounded-lg bg-bg-secondary text-text-secondary">
                    <BookOpen className="size-5" aria-hidden="true" />
                  </span>
                  <p className="mt-5 text-xs font-medium uppercase tracking-widest text-text-muted">
                    {subject.code || "Community subject"}
                  </p>
                  <h3 className="mt-2 font-display text-lg font-semibold text-text-primary">
                    {titleCase(subject.name)}
                  </h3>
                  <span className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-medium">
                    Open resources
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-border bg-bg-secondary p-8 text-center">
              <BookOpen className="mx-auto size-8 text-text-muted" aria-hidden="true" />
              <h3 className="mt-4 font-display text-lg font-semibold">No subjects here yet</h3>
              <p className="mt-2 text-sm text-text-secondary">
                Your community creator has not attached a subject to this semester.
              </p>
            </div>
          )}
        </section>
      ) : (
        <section className="py-8" aria-labelledby="library-resources-heading">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="library-resources-heading" className="font-display text-xl font-semibold">
              Subject resources
            </h2>
            {loadState === "ready" ? (
              <span className="text-sm text-text-muted">
                {materials.length} {materials.length === 1 ? "file" : "files"}
              </span>
            ) : null}
          </div>

          <div className="mt-5">
            {loadState === "loading" ? <ExplorerSkeleton /> : null}
            {loadState === "error" ? (
              <div className="rounded-xl border border-destructive/30 bg-bg-primary p-6">
                <h3 className="font-display text-lg font-semibold">Couldn&apos;t load these resources</h3>
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
            {loadState === "ready" && materials.length > 0 ? (
              <div className="space-y-5">
                {groupedMaterials.map(([shelf, shelfMaterials]) => (
                  <section key={shelf} className="overflow-hidden rounded-xl border border-border bg-bg-primary">
                    <div className="border-b border-border bg-bg-secondary px-4 py-3">
                      <h3 className="text-sm font-semibold">{shelf}</h3>
                    </div>
                    <ul>
                      {shelfMaterials.map((material) => {
                        const canOpen = Boolean(material.documentId) && material.previewAvailable !== false;
                        return (
                          <li key={`${material.documentId}:${material.path}`} className="border-b border-border last:border-b-0">
                            <button
                              type="button"
                              disabled={!canOpen}
                              onClick={() => {
                                onMaterialOpen(material, selectedSubject);
                                updateLibraryUrl({
                                  semester: selectedTerm.id,
                                  subject: selectedSubject.slug,
                                  document: material.documentId,
                                });
                              }}
                              className={cn(
                                "group flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none",
                                focusRing,
                              )}
                            >
                              <span className="flex h-11 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-bg-secondary text-[10px] font-semibold text-destructive">
                                {material.mimeType?.includes("pdf") || material.name.toLowerCase().endsWith(".pdf") ? "PDF" : "FILE"}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{material.name}</span>
                                <span className="mt-1 block text-xs text-text-muted">
                                  {formatSize(material.sizeBytes)}
                                  {!canOpen ? " · Preview unavailable" : ""}
                                </span>
                              </span>
                              {canOpen ? (
                                <ArrowRight className="size-4 text-text-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                              ) : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      )}
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
        setReaderError(error instanceof Error ? error.message : "This resource could not be opened.");
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
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg-secondary/60" aria-label="Document reader">
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
          <p className="truncate text-xs text-text-muted">{titleCase(subject.name)} · NanoAI active</p>
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
          <div className="flex h-full flex-col items-center justify-center gap-4" aria-live="polite">
            <div className="h-[78%] w-[88%] max-w-3xl animate-pulse rounded-lg bg-bg-primary motion-reduce:animate-none" />
            <p className="text-sm text-text-secondary">Opening {material.name}…</p>
          </div>
        ) : null}
        {readerState === "error" ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-md rounded-xl border border-border bg-bg-primary p-6 text-center">
              <FileText className="mx-auto size-9 text-text-muted" aria-hidden="true" />
              <h2 className="mt-4 font-display text-xl font-semibold">Couldn&apos;t open this resource</h2>
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
