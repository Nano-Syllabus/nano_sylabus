"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Camera,
  Check,
  Download,
  FileText,
  Images,
  LoaderCircle,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContentCameraPages } from "@/components/content-camera-pages";
import { compressAnswerPhoto } from "@/lib/answer-sheet-photo";
import {
  cameraPayload,
  cameraPdfFile,
  contentCameraApi,
  sendCameraPdf,
} from "@/lib/content-camera-client";
import { deleteCameraDraft, loadCameraDraft, saveCameraDraft } from "@/lib/content-camera-draft";
import {
  CONTENT_CAMERA_MAX_PAGES,
  type ContentCameraLink,
  type ContentCameraPhoto,
  type ContentCameraState,
} from "@/lib/content-camera-types";

type Photo = ContentCameraPhoto & { previewUrl: string };
const size = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const photoId = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function MobileContentScanner({ phoneLink }: { phoneLink: ContentCameraLink }) {
  const { id, token } = phoneLink;
  const [session, setSession] = useState<ContentCameraState | null>(null);
  const [pages, setPages] = useState<Photo[]>([]);
  const [name, setName] = useState("scanned-content");
  const [opening, setOpening] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [ended, setEnded] = useState(false);
  const [draftSaved, setDraftSaved] = useState(true);
  const [pdf, setPdf] = useState<{ file: File; url: string } | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const working = useRef(false);
  const urls = useRef(new Set<string>());
  const pdfUrl = useRef("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    const link = { id, token };
    const refresh = async () => {
      try {
        const response = await fetch(contentCameraApi(link), { cache: "no-store" });
        if (disposed) return;
        if (response.status === 410 || response.status === 404) {
          setEnded(true);
          return;
        }
        const state = await cameraPayload<ContentCameraState>(response);
        if (!disposed) {
          setSession(state);
          if (state.pdf) void deleteCameraDraft(id).catch(() => undefined);
        }
      } catch (cause) {
        if (!disposed && !working.current)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not connect. Check your connection and retry.",
          );
      } finally {
        if (!disposed) setOpening(false);
      }
    };
    void (async () => {
      await refresh();
      try {
        const draft = await loadCameraDraft(id);
        if (draft && !disposed) {
          setName(draft.name);
          setPages(
            draft.pages.map((page) => {
              const previewUrl = URL.createObjectURL(page.blob);
              urls.current.add(previewUrl);
              return { ...page, previewUrl };
            }),
          );
        }
      } catch {
        if (!disposed) setDraftSaved(false);
      } finally {
        if (!disposed) setReady(true);
      }
    })();
    let fetching = false;
    const timer = window.setInterval(() => {
      if (disposed || fetching || working.current || document.visibilityState !== "visible") return;
      fetching = true;
      void refresh().finally(() => {
        fetching = false;
      });
    }, 3000);
    return () => {
      disposed = true;
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [id, token]);
  useEffect(() => {
    if (!ready || !session || session.pdf || ended) return;
    const timer = window.setTimeout(() => {
      void saveCameraDraft({
        id,
        expiresAt: session.expiresAt,
        name,
        pages: pages.map(({ previewUrl: _url, ...page }) => page),
      })
        .then(() => {
          if (mounted.current) setDraftSaved(true);
        })
        .catch(() => {
          if (mounted.current) setDraftSaved(false);
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [id, pages, name, ready, session, ended]);
  useEffect(
    () => () => {
      urls.current.forEach((url) => URL.revokeObjectURL(url));
      urls.current.clear();
      if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current);
    },
    [],
  );
  const invalidate = () => {
    if (pdfUrl.current) {
      URL.revokeObjectURL(pdfUrl.current);
      pdfUrl.current = "";
    }
    setPdf(null);
  };
  const add = async (files: File[]) => {
    if (working.current || !session || session.pdf || ended || !files.length) return;
    if (pages.length + files.length > CONTENT_CAMERA_MAX_PAGES) {
      setError("A scan can have up to 50 pages. Choose fewer photos.");
      return;
    }
    working.current = true;
    setError("");
    invalidate();
    try {
      for (let index = 0; index < files.length; index++) {
        setBusy(`Compressing photo ${index + 1} of ${files.length}…`);
        const file = files[index];
        const compressed = await compressAnswerPhoto(file);
        if (!mounted.current) return;
        const previewUrl = URL.createObjectURL(compressed.blob);
        urls.current.add(previewUrl);
        const page: Photo = { ...compressed, id: photoId(), originalSize: file.size, previewUrl };
        setPages((current) => [...current, page]);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not prepare that photo. Try another image.",
      );
    } finally {
      working.current = false;
      if (mounted.current) setBusy("");
    }
  };
  const create = async () => {
    if (!pages.length || working.current || ended || session?.pdf) return;
    working.current = true;
    setError("");
    setBusy("Creating your compressed PDF…");
    try {
      // Let the status paint before the short local Blob assembly.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const file = cameraPdfFile(pages, name);
      invalidate();
      const url = URL.createObjectURL(file);
      pdfUrl.current = url;
      setPdf({ file, url });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the PDF.");
    } finally {
      working.current = false;
      setBusy("");
    }
  };
  const send = async () => {
    if (!pdf || working.current || ended || session?.pdf) return;
    working.current = true;
    setError("");
    setBusy("Preparing PDF upload…");
    try {
      const state = await sendCameraPdf({ id, token }, pdf.file, pages.length, setBusy);
      setSession(state);
      await deleteCameraDraft(id).catch(() => undefined);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Upload interrupted. Your PDF is still here; please retry.",
      );
    } finally {
      working.current = false;
      setBusy("");
    }
  };
  const locked = opening || !ready || !session || Boolean(busy) || ended || Boolean(session.pdf);
  const originalBytes = pages.reduce((total, page) => total + page.originalSize, 0);
  const compressedBytes = pages.reduce((total, page) => total + page.blob.size, 0);
  const stage = session?.pdf ? 4 : pdf ? 2 : pages.length ? 1 : 0;
  return (
    <div className="space-y-5 pb-8" aria-busy={opening || Boolean(busy)}>
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex size-9 items-center justify-center rounded-xl bg-text-primary text-bg-primary">
            <Smartphone className="size-4" />
          </span>
          Nano Syllabus
        </div>
        <span className="rounded-full border border-border px-3 py-1 text-xs text-text-secondary">
          Phone scan
        </span>
      </header>
      <section className="rounded-3xl border border-border bg-bg-secondary p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">
          Your pages, one document
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Scan. Arrange. Send.</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Turn your photos into a compact PDF, ready for your desktop.
        </p>
        {session ? (
          <div className="mt-4 rounded-xl border border-border bg-bg-primary px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-text-muted">Destination</p>
            <p className="mt-1 break-words text-sm font-medium">{session.title}</p>
          </div>
        ) : null}
        <ol className="mt-5 flex items-center justify-between gap-2" aria-label="Scan progress">
          {["Collect", "Arrange", "Create PDF", "Send"].map((label, index) => (
            <li
              key={label}
              className={`flex flex-col items-center gap-1.5 text-[11px] ${index <= stage ? "text-text-primary" : "text-text-muted"}`}
            >
              <span
                className={`flex size-7 items-center justify-center rounded-full border ${index <= stage ? "border-text-primary bg-text-primary text-bg-primary" : "border-border"}`}
              >
                {index < stage ? <Check className="size-3.5" /> : index + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>
      </section>
      {opening ? (
        <p role="status" className="flex items-center justify-center gap-2 py-6 text-sm">
          <LoaderCircle className="size-4 animate-spin" />
          Connecting to your desktop…
        </p>
      ) : null}
      {session?.pdf ? (
        <section className="rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
            <Check className="size-6" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">PDF sent to your desktop</h2>
          <p className="mt-2 break-all text-sm text-text-secondary">{session.pdf.name}</p>
          <p className="mt-1 text-xs text-text-muted">
            {session.pdf.pageCount} pages · {size(session.pdf.size)}
          </p>
          <p className="mt-4 text-sm leading-6 text-text-secondary">
            Return to your desktop to review the PDF, then choose{" "}
            <strong>Upload PDF and index</strong>.
          </p>
          {pdf ? (
            <a
              href={pdf.url}
              download={pdf.file.name}
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm underline underline-offset-4"
            >
              <Download className="size-4" />
              Save a copy
            </a>
          ) : null}
        </section>
      ) : null}
      {ended ? (
        <p role="status" className="rounded-xl border border-border p-4 text-sm">
          This camera session has ended. To start another scan, open a new QR link on your desktop.
        </p>
      ) : null}
      {session && !session.pdf && !ended ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={locked}
              onClick={() => camera.current?.click()}
              className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl bg-text-primary p-4 text-bg-primary disabled:opacity-50"
            >
              <Camera className="size-6" />
              <span className="text-sm font-semibold">Take photo</span>
              <span className="text-xs opacity-75">Use your camera</span>
            </button>
            <button
              type="button"
              disabled={locked}
              onClick={() => picker.current?.click()}
              className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-bg-secondary p-4 disabled:opacity-50"
            >
              <Images className="size-6" />
              <span className="text-sm font-semibold">Choose photos</span>
              <span className="text-xs text-text-muted">From your gallery</span>
            </button>
          </div>
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Take page photo"
            className="hidden"
            disabled={locked}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void add(files);
            }}
          />
          <input
            ref={picker}
            type="file"
            accept="image/*"
            multiple
            aria-label="Choose page photos"
            className="hidden"
            disabled={locked}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void add(files);
            }}
          />
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold">Your pages</h2>
              <span className="text-xs text-text-muted">{pages.length} / 50</span>
            </div>
            <ContentCameraPages
              pages={pages.map((page) => ({
                id: page.id,
                name: page.name,
                size: page.blob.size,
                mimeType: "image/jpeg",
                source: "phone",
                previewUrl: page.previewUrl,
              }))}
              disabled={locked}
              onRemove={(pageId) => {
                invalidate();
                setPages((current) =>
                  current.filter((page) => {
                    if (page.id !== pageId) return true;
                    URL.revokeObjectURL(page.previewUrl);
                    urls.current.delete(page.previewUrl);
                    return false;
                  }),
                );
              }}
              onReorder={(order) => {
                invalidate();
                setPages((current) =>
                  order
                    .map((pageId) => current.find((page) => page.id === pageId)!)
                    .filter(Boolean),
                );
              }}
            />
          </section>
          {pages.length ? (
            <section className="space-y-4 rounded-2xl border border-border p-4">
              <div className="flex items-center justify-between gap-2 text-xs text-text-secondary">
                <span>Compressed on your phone</span>
                <span className="flex items-center gap-1.5">
                  {size(originalBytes)}
                  <ArrowRight className="size-3" />
                  {size(compressedBytes)}
                </span>
              </div>
              <label className="block text-sm font-medium">
                PDF name
                <input
                  value={name}
                  maxLength={120}
                  disabled={locked}
                  onChange={(event) => {
                    setName(event.target.value);
                    invalidate();
                  }}
                  className="mt-2 min-h-12 w-full rounded-xl border border-border bg-bg-primary px-3 text-base font-normal outline-none focus:border-text-primary"
                />
              </label>
              {!pdf ? (
                <Button
                  type="button"
                  className="min-h-12 w-full"
                  disabled={locked}
                  onClick={() => void create()}
                >
                  <FileText className="size-4" />
                  Create PDF
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-xl bg-bg-secondary p-3">
                    <FileText className="size-5 shrink-0" />
                    <div className="min-w-0">
                      <p className="break-all text-sm font-medium">{pdf.file.name}</p>
                      <p className="text-xs text-text-muted">
                        {pages.length} pages · {size(pdf.file.size)}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-center gap-5">
                    <a
                      href={pdf.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
                    >
                      Preview PDF
                    </a>
                    <a
                      href={pdf.url}
                      download={pdf.file.name}
                      className="inline-flex min-h-11 items-center gap-1.5 text-sm underline underline-offset-4"
                    >
                      <Download className="size-4" />
                      Save PDF
                    </a>
                  </div>
                  <Button
                    type="button"
                    className="min-h-12 w-full"
                    disabled={locked}
                    onClick={() => void send()}
                  >
                    <ArrowRight className="size-4" />
                    Send PDF to desktop
                  </Button>
                </div>
              )}
            </section>
          ) : null}
          {!draftSaved ? (
            <p className="text-xs text-text-muted">
              This browser cannot save a local draft. Keep this tab open until you send your PDF.
            </p>
          ) : null}
        </>
      ) : null}
      {busy ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-border bg-bg-secondary p-4 text-sm"
        >
          <LoaderCircle className="size-4 shrink-0 animate-spin" />
          {busy}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-600"
        >
          {error}
        </p>
      ) : null}
      <p className="text-center text-xs leading-5 text-text-muted">
        Photos stay on this phone. Compression and PDF creation happen here. Only your finished PDF
        is uploaded.
      </p>
    </div>
  );
}
