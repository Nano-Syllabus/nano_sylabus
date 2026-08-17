"use client";

import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  LibraryBig,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { cn } from "@/lib/utils";

export type ChatLibrarySubject = {
  name: string;
  slug: string;
};

type Material = {
  name: string;
  shelf: string;
  path: string;
  indexed: boolean;
  documentId: string;
  sizeBytes: number;
  mimeType?: string;
  previewAvailable?: boolean;
};

type LibrarySubject = {
  name: string;
  slug: string;
  courseId: string;
  courseName: string;
  materials: Material[];
};

type PdfViewState = {
  readerZoom: number;
  zoomPoint: { x: number; y: number } | null;
};

type LoadState = "idle" | "loading" | "ready" | "error";
const MIN_PANEL_WIDTH = 380;
const DEFAULT_PANEL_WIDTH = 520;
const MIN_CHAT_WIDTH = 480;
const MAX_CACHED_PDFS = 12;
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

function formatSize(bytes: number) {
  if (!bytes) return "PDF";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPdf(material: Material) {
  return (
    material.mimeType?.toLowerCase().includes("pdf") ||
    material.name.toLowerCase().endsWith(".pdf")
  );
}

function shelfLabel(value: string) {
  return value.trim() || "Materials";
}

function materialCacheKey(material: Material) {
  return `${material.documentId}:${material.path}:${material.sizeBytes}`;
}

function readCachedPdf(cache: Map<string, string>, key: string) {
  const objectUrl = cache.get(key);
  if (!objectUrl) return null;
  cache.delete(key);
  cache.set(key, objectUrl);
  return objectUrl;
}

function writeCachedPdf(cache: Map<string, string>, key: string, objectUrl: string) {
  const previousObjectUrl = cache.get(key);
  if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);
  cache.delete(key);
  cache.set(key, objectUrl);

  while (cache.size > MAX_CACHED_PDFS) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    const oldestObjectUrl = cache.get(oldestKey);
    cache.delete(oldestKey);
    if (oldestObjectUrl) URL.revokeObjectURL(oldestObjectUrl);
  }
}

function LibrarySkeleton() {
  return (
    <div className="space-y-3 p-4" aria-label="Loading course materials">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-lg border border-border bg-bg-primary p-3"
        >
          <div className="h-12 w-10 shrink-0 animate-pulse rounded-md bg-bg-tertiary motion-reduce:animate-none" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-3/4 animate-pulse rounded-full bg-bg-tertiary motion-reduce:animate-none" />
            <div className="h-3 w-1/3 animate-pulse rounded-full bg-bg-secondary motion-reduce:animate-none" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChatMaterialsLibrary({
  subject,
  activeSubject,
  open,
  width,
  onWidthChange,
  onClose,
  onSubjectSelect,
}: {
  subject: ChatLibrarySubject | null;
  activeSubject?: ChatLibrarySubject | null;
  open: boolean;
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
  onSubjectSelect?: (subject: ChatLibrarySubject) => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const resizingRef = useRef(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [librarySubjects, setLibrarySubjects] = useState<LibrarySubject[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [openShelves, setOpenShelves] = useState<Set<string>>(new Set());
  const [openSubjects, setOpenSubjects] = useState<Set<string>>(new Set());
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [readerState, setReaderState] = useState<LoadState>("idle");
  const [readerError, setReaderError] = useState("");
  const [pdfObjectUrl, setPdfObjectUrl] = useState("");
  const [readerZoom, setReaderZoom] = useState(100);
  const [zoomPoint, setZoomPoint] = useState<{ x: number; y: number } | null>(null);
  const pdfCacheRef = useRef<Map<string, string>>(new Map());
  const pdfRequestsRef = useRef<Map<string, Promise<string>>>(new Map());
  const pdfViewStateRef = useRef<Map<string, PdfViewState>>(new Map());
  const lastTouchRef = useRef<{ time: number; x: number; y: number } | null>(null);

  const subjectKey = subject ? `${subject.slug}:${subject.name}` : "all";
  const activeSubjectSlug = activeSubject?.slug || subject?.slug || null;

  useEffect(() => {
    const pdfCache = pdfCacheRef.current;
    const pdfRequests = pdfRequestsRef.current;
    const pdfViewState = pdfViewStateRef.current;
    return () => {
      for (const objectUrl of pdfCache.values()) {
        URL.revokeObjectURL(objectUrl);
      }
      pdfCache.clear();
      pdfRequests.clear();
      pdfViewState.clear();
    };
  }, []);

  const previousSubjectKeyRef = useRef(subjectKey);
  useEffect(() => {
    if (previousSubjectKeyRef.current === subjectKey) return;
    previousSubjectKeyRef.current = subjectKey;
    if (!open) return;
    setSelectedMaterial(null);
    setPdfObjectUrl("");
    setReaderState("idle");
    setReaderError("");
    setReaderZoom(100);
    setZoomPoint(null);
  }, [open, subjectKey]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (selectedMaterial) {
          setSelectedMaterial(null);
        } else {
          onClose();
        }
        return;
      }

      if (event.key !== "Tab" || window.innerWidth >= 1024 || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    if (window.innerWidth < 1024) {
      window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, selectedMaterial]);

  useEffect(() => {
    if (!open) return;

    function clampPanelWidth() {
      if (window.innerWidth < 1024) return;
      const { min, max } = panelBounds();
      const clamped = Math.round(Math.min(max, Math.max(min, width)));
      if (clamped !== width) onWidthChange(clamped);
    }

    const frame = window.requestAnimationFrame(clampPanelWidth);
    window.addEventListener("resize", clampPanelWidth);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", clampPanelWidth);
    };
  }, [onWidthChange, open, width]);

  useEffect(() => {
    setQuery("");
    setMaterials([]);
    setLibrarySubjects([]);
    setOpenShelves(new Set());
    setOpenSubjects(new Set());
    setLoadError("");

    if (!open) {
      setLoadState("idle");
      return;
    }

    const controller = new AbortController();
    setLoadState("loading");

    async function loadMaterials() {
      try {
        const requestedSubject = subject ? subject.slug || subject.name : "";
        const response = await fetch(
          subject
            ? `/api/student/materials?subject=${encodeURIComponent(requestedSubject)}`
            : "/api/student/materials",
          { cache: "no-store", signal: controller.signal },
        );
        const payload = (await response.json().catch(() => null)) as {
          materials?: Material[];
          subjects?: Array<{
            courseId?: string;
            courseName?: string;
            subject?: { name?: string; slug?: string };
            materials?: Material[];
          }>;
          subject?: { name?: string; slug?: string; courseId?: string };
          error?: string;
        } | null;
        if (!response.ok) {
          throw new Error(payload?.error || "Could not load the course library.");
        }

        const nextMaterials = Array.isArray(payload?.materials) ? payload.materials : [];
        if (subject) {
          setMaterials(nextMaterials);
          const subjectEntry: LibrarySubject = {
            name: payload?.subject?.name || subject.name,
            slug: payload?.subject?.slug || subject.slug,
            courseId: payload?.subject?.courseId || "",
            courseName: "",
            materials: nextMaterials,
          };
          setLibrarySubjects([subjectEntry]);
          const firstShelf = nextMaterials[0] ? shelfLabel(nextMaterials[0].shelf) : "";
          setOpenShelves(firstShelf ? new Set([firstShelf]) : new Set());
          setOpenSubjects(new Set([subjectEntry.slug]));
        } else {
          const nextSubjects = (Array.isArray(payload?.subjects) ? payload.subjects : [])
            .map((entry) => ({
              name: entry.subject?.name || "Subject",
              slug: entry.subject?.slug || entry.subject?.name || "subject",
              courseId: entry.courseId || "",
              courseName: entry.courseName || "",
              materials: Array.isArray(entry.materials) ? entry.materials : [],
            }))
            .filter((entry) => entry.slug);
          setLibrarySubjects(nextSubjects);
          setOpenSubjects(nextSubjects[0] ? new Set([nextSubjects[0].slug]) : new Set());
          const firstShelf = nextSubjects[0]?.materials[0]
            ? shelfLabel(nextSubjects[0].materials[0].shelf)
            : "";
          setOpenShelves(
            firstShelf && nextSubjects[0]
              ? new Set([`${nextSubjects[0].slug}:${firstShelf}`])
              : new Set(),
          );
        }
        setLoadState("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMaterials([]);
        setLibrarySubjects([]);
        setLoadError(
          error instanceof Error ? error.message : "Could not load the course library.",
        );
        setLoadState("error");
      }
    }

    void loadMaterials();
    return () => controller.abort();
  }, [open, reloadKey, subject]);

  useEffect(() => {
    setPdfObjectUrl("");
    setReaderError("");
    lastTouchRef.current = null;

    if (!selectedMaterial) {
      setReaderState("idle");
      return;
    }

    const material = selectedMaterial;
    const cacheKey = materialCacheKey(material);
    const savedViewState = pdfViewStateRef.current.get(cacheKey);
    setReaderZoom(savedViewState?.readerZoom ?? 100);
    setZoomPoint(savedViewState?.zoomPoint ?? null);

    const cachedObjectUrl = readCachedPdf(pdfCacheRef.current, cacheKey);
    if (cachedObjectUrl) {
      setPdfObjectUrl(cachedObjectUrl);
      setReaderState("ready");
      return;
    }

    setReaderState("loading");
    let active = true;
    let request = pdfRequestsRef.current.get(cacheKey);

    if (!request) {
      request = (async () => {
        const response = await fetch(
          `/api/student/materials/${encodeURIComponent(material.documentId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || "This PDF preview could not be opened.");
        }
        const contentType = response.headers.get("content-type") || "";
        const filenameLooksLikePdf = material.name.toLowerCase().endsWith(".pdf");
        if (!contentType.toLowerCase().includes("pdf") && !filenameLooksLikePdf) {
          throw new Error("This material is not a PDF. Open it in a new tab instead.");
        }
        const responseBlob = await response.blob();
        const blob = responseBlob.type.toLowerCase().includes("pdf")
          ? responseBlob
          : new Blob([responseBlob], { type: "application/pdf" });
        const objectUrl = URL.createObjectURL(blob);
        writeCachedPdf(pdfCacheRef.current, cacheKey, objectUrl);
        return objectUrl;
      })();
      pdfRequestsRef.current.set(cacheKey, request);
      void request.then(
        () => {
          if (pdfRequestsRef.current.get(cacheKey) === request) {
            pdfRequestsRef.current.delete(cacheKey);
          }
        },
        () => {
          if (pdfRequestsRef.current.get(cacheKey) === request) {
            pdfRequestsRef.current.delete(cacheKey);
          }
        },
      );
    }

    void request.then(
      (objectUrl) => {
        if (!active) return;
        setPdfObjectUrl(objectUrl);
        setReaderState("ready");
      },
      (error: unknown) => {
        if (!active) return;
        setReaderError(error instanceof Error ? error.message : "This PDF could not be opened.");
        setReaderState("error");
      },
    );

    return () => {
      active = false;
    };
  }, [selectedMaterial]);

  const filteredMaterials = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return materials;
    return materials.filter((material) =>
      `${material.name} ${material.shelf}`.toLowerCase().includes(normalizedQuery),
    );
  }, [materials, query]);

  const groupedMaterials = useMemo(() => {
    const groups = new Map<string, Material[]>();
    for (const material of filteredMaterials) {
      const shelf = shelfLabel(material.shelf);
      groups.set(shelf, [...(groups.get(shelf) || []), material]);
    }
    return [...groups.entries()];
  }, [filteredMaterials]);

  const filteredLibrarySubjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return librarySubjects;

    return librarySubjects
      .map((entry) => {
        const subjectMatches = `${entry.name} ${entry.courseName}`
          .toLowerCase()
          .includes(normalizedQuery);
        const nextMaterials = subjectMatches
          ? entry.materials
          : entry.materials.filter((material) =>
              `${material.name} ${material.shelf}`.toLowerCase().includes(normalizedQuery),
            );
        return { ...entry, materials: nextMaterials };
      })
      .filter((entry) => entry.materials.length > 0 || `${entry.name} ${entry.courseName}`.toLowerCase().includes(normalizedQuery));
  }, [librarySubjects, query]);

  const viewerUrl = useMemo(() => {
    if (!pdfObjectUrl) return "";
    const zoom =
      readerZoom > 100 && zoomPoint
        ? `${readerZoom},${Math.round(zoomPoint.x)},${Math.round(zoomPoint.y)}`
        : "page-fit";
    return `${pdfObjectUrl}#toolbar=0&navpanes=0&scrollbar=1&zoom=${zoom}`;
  }, [pdfObjectUrl, readerZoom, zoomPoint]);

  function applyReaderZoom(clientX: number, clientY: number) {
    const viewer = panelRef.current?.querySelector<HTMLElement>("[data-pdf-viewer]");
    const bounds = viewer?.getBoundingClientRect();
    const point = bounds
      ? { x: Math.max(0, clientX - bounds.left), y: Math.max(0, clientY - bounds.top) }
      : { x: 0, y: 0 };
    const nextZoom = readerZoom > 100 ? 100 : 150;
    const nextZoomPoint = nextZoom > 100 ? point : null;
    setZoomPoint(nextZoomPoint);
    setReaderZoom(nextZoom);
    if (selectedMaterial) {
      pdfViewStateRef.current.set(materialCacheKey(selectedMaterial), {
        readerZoom: nextZoom,
        zoomPoint: nextZoomPoint,
      });
    }
  }

  function handleReaderDoubleClick(event: ReactMouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    applyReaderZoom(event.clientX, event.clientY);
  }

  function handleReaderTouchEnd(event: ReactTouchEvent<HTMLElement>) {
    const touch = event.changedTouches[0];
    if (!touch) return;
    const now = Date.now();
    const previous = lastTouchRef.current;
    const isDoubleTap =
      previous &&
      now - previous.time < 350 &&
      Math.hypot(touch.clientX - previous.x, touch.clientY - previous.y) < 32;
    lastTouchRef.current = isDoubleTap ? null : { time: now, x: touch.clientX, y: touch.clientY };
    if (!isDoubleTap) return;
    event.preventDefault();
    event.stopPropagation();
    applyReaderZoom(touch.clientX, touch.clientY);
  }

  function toggleShelf(shelf: string) {
    setOpenShelves((current) => {
      const next = new Set(current);
      if (next.has(shelf)) next.delete(shelf);
      else next.add(shelf);
      return next;
    });
  }

  function toggleSubject(slug: string) {
    setOpenSubjects((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function panelBounds() {
    const max =
      typeof window === "undefined"
        ? DEFAULT_PANEL_WIDTH
        : Math.max(MIN_PANEL_WIDTH, window.innerWidth - MIN_CHAT_WIDTH);
    return { min: MIN_PANEL_WIDTH, max };
  }

  function resizeFromClientX(clientX: number) {
    const panel = panelRef.current?.getBoundingClientRect();
    if (!panel) return;
    const { min, max } = panelBounds();
    onWidthChange(Math.round(Math.min(max, Math.max(min, panel.right - clientX))));
  }

  function startResize(event: ReactPointerEvent<HTMLButtonElement>) {
    resizingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function continueResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!resizingRef.current) return;
    resizeFromClientX(event.clientX);
  }

  function stopResize() {
    resizingRef.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  function handleResizeKey(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const { min, max } = panelBounds();
    const direction = event.key === "ArrowLeft" ? 1 : -1;
    onWidthChange(Math.min(max, Math.max(min, width + direction * 24)));
  }

  function renderMaterialRow(material: Material) {
    const pdf = isPdf(material);
    const canOpen = Boolean(material.documentId) && material.previewAvailable !== false;
    const rowClass = cn(
      "group flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors motion-reduce:transition-none hover:bg-bg-secondary",
      focusRing,
    );
    const contents = (
      <>
        <div className="flex h-11 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-bg-secondary text-[10px] font-semibold text-destructive">
          {pdf ? "PDF" : "FILE"}
        </div>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{material.name}</span>
          <span className="mt-1 block truncate text-xs text-text-muted">
            {formatSize(material.sizeBytes)}
            {!canOpen ? " · Preview unavailable" : ""}
          </span>
        </span>
        {canOpen ? (
          <ChevronRight
            className="h-4 w-4 shrink-0 text-text-muted transition-transform motion-reduce:transition-none group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        ) : null}
      </>
    );

    return (
      <li key={`${material.documentId}:${material.path}`} className="border-b border-border last:border-b-0">
        {!canOpen ? (
          <div className={cn(rowClass, "cursor-not-allowed opacity-60 hover:bg-bg-primary")}>
            {contents}
          </div>
        ) : pdf ? (
          <button type="button" onClick={() => setSelectedMaterial(material)} className={rowClass}>
            {contents}
          </button>
        ) : (
          <a
            href={`/api/student/materials/${encodeURIComponent(material.documentId)}`}
            target="_blank"
            rel="noreferrer"
            className={rowClass}
          >
            {contents}
          </a>
        )}
      </li>
    );
  }

  if (!open) return null;

  const compactReader = width < 500;

  return (
    <aside
      id="chat-course-library"
      ref={panelRef}
      aria-label="Course library"
      className="fixed inset-0 z-50 flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden border-l border-border bg-bg-primary text-text-primary lg:inset-y-0 lg:left-auto lg:right-0 lg:z-40 lg:w-[var(--chat-library-width)]"
      style={{ "--chat-library-width": `${width}px` } as CSSProperties}
    >
      <button
        type="button"
        aria-label="Resize course library"
        title="Drag or use the left and right arrow keys to resize"
        onPointerDown={startResize}
        onPointerMove={continueResize}
        onPointerUp={stopResize}
        onPointerCancel={stopResize}
        onDoubleClick={() => onWidthChange(DEFAULT_PANEL_WIDTH)}
        onKeyDown={handleResizeKey}
        className={cn(
          "group absolute -left-2 top-0 z-20 hidden h-full w-4 cursor-col-resize items-center justify-center lg:flex",
          focusRing,
        )}
      >
        <span className="h-14 w-1 rounded-full bg-border transition-colors motion-reduce:transition-none group-hover:bg-border-strong group-focus-visible:bg-border-strong" />
      </button>

      {selectedMaterial ? (
        <>
          <div className="flex min-h-10 items-center gap-1 border-b border-border px-2">
            <button
              type="button"
              onClick={() => setSelectedMaterial(null)}
              className={cn(
                "inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-md px-2 text-sm font-medium text-text-secondary transition-colors motion-reduce:transition-none hover:bg-bg-secondary hover:text-text-primary",
                focusRing,
              )}
              aria-label="Back to library"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {!compactReader ? <span>Library</span> : null}
            </button>
            <div className="h-5 w-px bg-border" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{selectedMaterial.name}</p>
            </div>
            <a
              href={`/api/student/materials/${encodeURIComponent(selectedMaterial.documentId)}?download=1`}
              className={cn(
                "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors motion-reduce:transition-none hover:bg-bg-secondary hover:text-text-primary",
                focusRing,
              )}
              aria-label={`Download ${selectedMaterial.name}`}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
            </a>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className={cn(
                "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors motion-reduce:transition-none hover:bg-bg-secondary hover:text-text-primary",
                focusRing,
              )}
              aria-label="Close course library"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div
            data-pdf-viewer
            className="relative min-h-0 flex-1 overflow-hidden bg-bg-primary"
            onDoubleClick={handleReaderDoubleClick}
            onTouchEnd={handleReaderTouchEnd}
          >
            {readerState === "loading" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6" aria-live="polite">
                <div className="h-[72%] w-[88%] max-w-2xl animate-pulse rounded-md bg-bg-primary shadow-sm motion-reduce:animate-none" />
                <p className="text-sm text-text-secondary">Opening PDF…</p>
              </div>
            ) : null}

            {readerState === "error" ? (
              <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-sm rounded-lg border border-border bg-bg-primary p-5 text-center">
                  <FileText className="mx-auto h-8 w-8 text-text-muted" aria-hidden="true" />
                  <h3 className="mt-3 text-sm font-semibold">Couldn&apos;t open this PDF</h3>
                  <p className="mt-2 text-sm text-text-secondary">{readerError}</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const material = selectedMaterial;
                        setSelectedMaterial(null);
                        window.requestAnimationFrame(() => setSelectedMaterial(material));
                      }}
                      className={cn("inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-bg-secondary", focusRing)}
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden="true" />
                      Try again
                    </button>
                    <a
                      href={`/api/student/materials/${encodeURIComponent(selectedMaterial.documentId)}`}
                      target="_blank"
                      rel="noreferrer"
                      className={cn("inline-flex h-10 items-center gap-2 rounded-md bg-text-primary px-3 text-sm font-medium text-text-inverse", focusRing)}
                    >
                      Open separately
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              </div>
            ) : null}

            {readerState === "ready" && viewerUrl ? (
              <iframe
                key={viewerUrl}
                src={viewerUrl}
                title={selectedMaterial.name}
                className="h-full w-full border-0 bg-bg-primary"
                style={{ colorScheme: "light" }}
                onDoubleClick={handleReaderDoubleClick}
                onTouchEnd={handleReaderTouchEnd}
              />
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="flex min-h-16 items-center gap-3 border-b border-border px-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-secondary text-text-primary">
              <LibraryBig className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold">Course library</h2>
              <p className="mt-0.5 truncate text-xs text-text-muted">
                {subject
                  ? `${subject.name} · ${loadState === "ready" ? `${materials.length} file${materials.length === 1 ? "" : "s"}` : "Materials"}`
                  : loadState === "loading"
                    ? "Loading your course library…"
                    : `${librarySubjects.length} subject${librarySubjects.length === 1 ? "" : "s"} · ${librarySubjects.reduce((total, entry) => total + entry.materials.length, 0)} files`}
              </p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className={cn(
                "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors motion-reduce:transition-none hover:bg-bg-secondary hover:text-text-primary",
                focusRing,
              )}
              aria-label="Close course library"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {loadState !== "error" ? (
            <div className="border-b border-border p-4">
              <label htmlFor="chat-library-search" className="sr-only">
                Search course materials
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
                <input
                  id="chat-library-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={subject ? "Search this subject" : "Search course library"}
                  className={cn(
                    "h-11 w-full rounded-lg border border-border bg-bg-primary pl-10 pr-3 text-sm text-text-primary placeholder:text-text-muted",
                    focusRing,
                  )}
                />
              </div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-bg-secondary/60">
            {loadState === "loading" ? <LibrarySkeleton /> : null}

            {loadState === "error" ? (
              <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-xs rounded-lg border border-border bg-bg-primary p-5 text-center">
                  <h3 className="text-sm font-semibold">Couldn&apos;t load the library</h3>
                  <p className="mt-2 text-sm text-text-secondary">{loadError}</p>
                  <button
                    type="button"
                    onClick={() => setReloadKey((current) => current + 1)}
                    className={cn("mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-text-primary px-4 text-sm font-medium text-text-inverse", focusRing)}
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Try again
                  </button>
                </div>
              </div>
            ) : null}

            {loadState === "ready" &&
            ((subject && materials.length === 0) || (!subject && librarySubjects.length === 0)) ? (
              <div className="flex h-full items-center justify-center p-6 text-center">
                <div className="max-w-xs">
                  <FileText className="mx-auto h-9 w-9 text-text-muted" aria-hidden="true" />
                  <h3 className="mt-3 text-sm font-semibold">
                    {subject ? "No materials yet" : "No library materials yet"}
                  </h3>
                  <p className="mt-2 text-sm text-text-secondary">
                    {subject
                      ? `Your teacher has not uploaded materials for ${subject.name} yet.`
                      : "Enrolled course subjects and their uploads will appear here."}
                  </p>
                </div>
              </div>
            ) : null}

            {loadState === "ready" &&
            ((subject && materials.length > 0 && groupedMaterials.length === 0) ||
              (!subject && librarySubjects.length > 0 && filteredLibrarySubjects.length === 0)) ? (
              <div className="flex h-full items-center justify-center p-6 text-center">
                <div className="max-w-xs">
                  <Search className="mx-auto h-8 w-8 text-text-muted" aria-hidden="true" />
                  <h3 className="mt-3 text-sm font-semibold">No matching materials</h3>
                  <p className="mt-2 text-sm text-text-secondary">
                    Try a different filename or shelf name.
                  </p>
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className={cn("mt-4 h-10 rounded-md border border-border px-4 text-sm font-medium hover:bg-bg-primary", focusRing)}
                  >
                    Clear search
                  </button>
                </div>
              </div>
            ) : null}

            {subject && groupedMaterials.length > 0 ? (
              <div className="space-y-3 p-3">
                {groupedMaterials.map(([shelf, shelfMaterials]) => {
                  const expanded = openShelves.has(shelf) || Boolean(query.trim());
                  return (
                    <section key={shelf} className="overflow-hidden rounded-lg border border-border bg-bg-primary">
                      <button
                        type="button"
                        onClick={() => toggleShelf(shelf)}
                        aria-expanded={expanded}
                        className={cn(
                          "flex min-h-14 w-full items-center gap-3 px-4 text-left transition-colors motion-reduce:transition-none hover:bg-bg-secondary",
                          focusRing,
                        )}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bg-secondary text-xs font-semibold">
                          {shelf.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{shelf}</span>
                          <span className="mt-0.5 block text-xs text-text-muted">
                            {shelfMaterials.length} material{shelfMaterials.length === 1 ? "" : "s"}
                          </span>
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 shrink-0 text-text-muted transition-transform motion-reduce:transition-none",
                            expanded && "rotate-180",
                          )}
                          aria-hidden="true"
                        />
                      </button>
                      {expanded ? (
                        <ul className="border-t border-border">{shelfMaterials.map(renderMaterialRow)}</ul>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            ) : null}

            {!subject && loadState === "ready" && filteredLibrarySubjects.length > 0 ? (
              <div className="space-y-3 p-3">
                {filteredLibrarySubjects.map((entry) => {
                  const expanded = openSubjects.has(entry.slug) || Boolean(query.trim());
                  const isActiveSubject =
                    activeSubjectSlug === entry.slug ||
                    activeSubject?.name.trim().toLowerCase() === entry.name.trim().toLowerCase();
                  const shelfGroups = new Map<string, Material[]>();
                  for (const material of entry.materials) {
                    const shelf = shelfLabel(material.shelf);
                    shelfGroups.set(shelf, [...(shelfGroups.get(shelf) || []), material]);
                  }
                  return (
                    <section key={`${entry.courseId}:${entry.slug}`} className="overflow-hidden rounded-lg border border-border bg-bg-primary">
                      <button
                        type="button"
                        onClick={() => {
                          onSubjectSelect?.({ name: entry.name, slug: entry.slug });
                          toggleSubject(entry.slug);
                        }}
                        aria-expanded={expanded}
                        aria-current={isActiveSubject ? "true" : undefined}
                        className={cn(
                          "flex min-h-16 w-full items-center gap-3 px-4 text-left transition-colors motion-reduce:transition-none hover:bg-bg-secondary",
                          isActiveSubject && "bg-bg-secondary",
                          focusRing,
                        )}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-bg-secondary text-xs font-semibold text-text-primary">
                          {entry.name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{entry.name}</span>
                          <span className="mt-0.5 block truncate text-xs text-text-muted">
                            {entry.materials.length} material{entry.materials.length === 1 ? "" : "s"}
                            {entry.courseName ? ` · ${entry.courseName}` : ""}
                          </span>
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 shrink-0 text-text-muted transition-transform motion-reduce:transition-none",
                            expanded && "rotate-180",
                          )}
                          aria-hidden="true"
                        />
                      </button>
                      {expanded ? (
                        shelfGroups.size > 0 ? (
                          <div className="border-t border-border">
                            {[...shelfGroups.entries()].map(([shelf, shelfMaterials]) => {
                              const shelfKey = `${entry.slug}:${shelf}`;
                              const shelfExpanded = openShelves.has(shelfKey) || Boolean(query.trim());
                              return (
                                <div key={shelfKey} className="border-b border-border last:border-b-0">
                                  <button
                                    type="button"
                                    onClick={() => toggleShelf(shelfKey)}
                                    aria-expanded={shelfExpanded}
                                    className={cn(
                                      "flex min-h-12 w-full items-center gap-3 px-4 text-left transition-colors motion-reduce:transition-none hover:bg-bg-secondary",
                                      focusRing,
                                    )}
                                  >
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bg-secondary text-[10px] font-semibold text-text-primary">
                                      {shelf.slice(0, 2).toUpperCase()}
                                    </div>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-medium">{shelf}</span>
                                      <span className="mt-0.5 block text-xs text-text-muted">
                                        {shelfMaterials.length} material{shelfMaterials.length === 1 ? "" : "s"}
                                      </span>
                                    </span>
                                    <ChevronDown
                                      className={cn(
                                        "h-4 w-4 shrink-0 text-text-muted transition-transform motion-reduce:transition-none",
                                        shelfExpanded && "rotate-180",
                                      )}
                                      aria-hidden="true"
                                    />
                                  </button>
                                  {shelfExpanded ? (
                                    <ul className="border-t border-border">{shelfMaterials.map(renderMaterialRow)}</ul>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="border-t border-border px-4 py-5 text-sm text-text-secondary">
                            No materials uploaded for this subject yet.
                          </div>
                        )
                      ) : null}
                    </section>
                  );
                })}
              </div>
            ) : null}
          </div>
        </>
      )}
    </aside>
  );
}
