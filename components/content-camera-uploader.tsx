"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Download, FileText, LoaderCircle, Smartphone, Upload } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { ContentCameraPages } from "@/components/content-camera-pages";
import {
  addCameraPhotos,
  cameraPayload,
  changeCamera,
  contentCameraApi,
  makeCameraPdf,
} from "@/lib/content-camera-client";
import type { ContentCameraLink, ContentCameraState } from "@/lib/content-camera-types";

type Opened = ContentCameraState & ContentCameraLink & { uploadPath: string };

/** One shared editor on desktop and phone. Only the authenticated desktop can
 * send the resulting PDF to a creator collection. Phone links grant capture
 * access for this session only, with no account or collection credentials. */
export function ContentCameraUploader({
  path,
  phoneLink,
  disabled = false,
  onUpload,
  onBusyChange,
}: {
  path?: string;
  phoneLink?: ContentCameraLink;
  disabled?: boolean;
  onUpload?: (file: File) => Promise<boolean>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [sheet, setSheet] = useState<ContentCameraState | null>(null);
  const [link, setLink] = useState<ContentCameraLink | null>(phoneLink ?? null);
  const [uploadUrl, setUploadUrl] = useState("");
  const [opening, setOpening] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [ended, setEnded] = useState(false);
  const [name, setName] = useState("scanned-content");
  const [pdf, setPdf] = useState<{ url: string; revision: number } | null>(null);
  const [restart, setRestart] = useState(0);
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const updating = useRef(false);
  const activeLink = useRef<ContentCameraLink | null>(phoneLink ?? null);
  const pdfUrl = useRef("");
  const onBusyRef = useRef(onBusyChange);
  onBusyRef.current = onBusyChange;
  const acceptState = useCallback((state: ContentCameraState) => {
    if (state.id !== activeLink.current?.id) return;
    setSheet((current) => {
      if (current && current.id === state.id && state.revision < current.revision) return current;
      const previews = new Map(current?.pages.map((page) => [page.id, page.previewUrl]));
      // Refresh signatures before they expire; normally retain URLs so polling
      // doesn't cause thumbnail reloads every three seconds.
      return {
        ...state,
        pages: state.pages.map((page) => {
          const old = previews.get(page.id);
          const expires = old
            ? Number(new URL(old, window.location.origin).searchParams.get("expires"))
            : 0;
          return { ...page, previewUrl: expires > Date.now() / 1000 + 60 ? old! : page.previewUrl };
        }),
      };
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    let owned: ContentCameraLink | null = null;
    activeLink.current = phoneLink ?? null;
    setOpening(true);
    setEnded(false);
    setError("");
    setSheet(null);
    const start = async () => {
      try {
        if (phoneLink) {
          const response = await fetch(contentCameraApi(phoneLink), { cache: "no-store" });
          const state = await cameraPayload<ContentCameraState>(response);
          if (!disposed) {
            setLink(phoneLink);
            acceptState(state);
          }
        } else {
          const response = await fetch("/api/teacher/content-camera", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path }),
          });
          const state = await cameraPayload<Opened>(response);
          owned = { id: state.id, token: state.token };
          if (disposed) {
            void fetch(contentCameraApi(owned), { method: "DELETE", keepalive: true });
            return;
          }
          activeLink.current = owned;
          setLink(owned);
          // Use the browser's actual origin: Next's internal request hostname
          // can be localhost even when the desktop was opened over the LAN.
          setUploadUrl(new URL(state.uploadPath, window.location.origin).toString());
          acceptState(state);
        }
      } catch (cause) {
        if (!disposed)
          setError(cause instanceof Error ? cause.message : "Could not open the camera upload.");
      } finally {
        if (!disposed) setOpening(false);
      }
    };
    void start();
    return () => {
      disposed = true;
      if (owned)
        void fetch(contentCameraApi(owned), { method: "DELETE", keepalive: true }).catch(
          () => undefined,
        );
    };
  }, [path, phoneLink, restart, acceptState]);

  const refresh = useCallback(async () => {
    if (!link || updating.current || ended) return;
    try {
      const response = await fetch(contentCameraApi(link), { cache: "no-store" });
      if (response.status === 410 || response.status === 404) setEnded(true);
      acceptState(await cameraPayload<ContentCameraState>(response));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh the pages.");
    }
  }, [link, ended, acceptState]);
  useEffect(() => {
    if (!link || ended) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [link, refresh, ended]);
  useEffect(() => {
    onBusyRef.current?.(Boolean(busy));
  }, [busy]);
  useEffect(
    () => () => {
      if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current);
      onBusyRef.current?.(false);
    },
    [],
  );

  const run = async (task: () => Promise<void>, label: string) => {
    if (updating.current || disabled || ended) return;
    updating.current = true;
    setBusy(label);
    setError("");
    try {
      await task();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The operation failed.");
    } finally {
      updating.current = false;
      setBusy("");
      await refresh();
    }
  };
  const add = (files: File[]) => {
    if (!link || !files.length) return;
    void run(
      () => addCameraPhotos(link, files, phoneLink ? "phone" : "desktop", setBusy),
      "Preparing photos…",
    );
  };
  const reorder = (order: string[]) => {
    if (!link) return;
    void run(async () => {
      acceptState(await changeCamera(link, { action: "reorder", order }));
    }, "Saving page order…");
  };
  const remove = (pageId: string) => {
    if (!link) return;
    void run(async () => {
      acceptState(await changeCamera(link, { action: "remove", pageId }));
    }, "Removing photo…");
  };
  const generate = (action: "preview" | "download" | "upload") => {
    if (!link) return;
    void run(async () => {
      // Fetch the latest phone arrivals before taking a stable PDF snapshot.
      const current = await fetch(contentCameraApi(link), { cache: "no-store" }).then(
        cameraPayload<ContentCameraState>,
      );
      acceptState(current);
      const file = await makeCameraPdf(link, current.revision, name);
      if (action === "upload") {
        setBusy("Uploading PDF and starting indexing…");
        if (await onUpload?.(file)) {
          await fetch(contentCameraApi(link), { method: "DELETE" }).then(cameraPayload);
          setEnded(true);
        }
        return;
      }
      if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current);
      const url = URL.createObjectURL(file);
      pdfUrl.current = url;
      setPdf({ url, revision: current.revision });
      if (action === "download") {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.name;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
      }
    }, "Creating PDF…");
  };
  const locked = disabled || opening || Boolean(busy) || ended;
  const canPdf = !locked && Boolean(sheet?.pages.length) && !sheet?.pendingCount;

  return (
    <div className="space-y-4" aria-busy={opening || Boolean(busy)}>
      <div className="flex items-start gap-3 rounded-xl border border-border bg-bg-secondary p-4">
        <Camera className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="text-sm font-semibold">Scan pages into one PDF</p>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            Take photos, drag them into order, and swipe through the preview. Up to{" "}
            {sheet?.maxPages ?? 50} pages. Photos are temporary and stored on the VPS; no images are
            stored in Supabase.
          </p>
          {phoneLink && sheet ? (
            <p className="mt-1 break-all text-xs text-text-secondary">{sheet.title}</p>
          ) : null}
        </div>
      </div>
      {!phoneLink && uploadUrl && !ended ? (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-4">
          <div className="rounded-lg bg-white p-2">
            <QRCodeSVG value={uploadUrl} size={140} level="M" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Smartphone className="size-4" />
              Capture with your phone
            </p>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              Scan the QR and photograph each page. Photos appear here within a few seconds. Keep
              this dialog open. The link lasts two hours.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-2"
              onClick={() =>
                void run(async () => {
                  if (!navigator.clipboard)
                    throw new Error(
                      "Open the phone link and copy its address, or use HTTPS to copy it here.",
                    );
                  await navigator.clipboard.writeText(uploadUrl);
                }, "Copying link…")
              }
              disabled={locked}
            >
              Copy phone link
            </Button>
            <a
              href={uploadUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Open phone camera link"
              className="ml-3 inline-flex min-h-11 items-center text-xs underline"
            >
              Open phone link
            </a>
            {/^(localhost|127\.0\.0\.1)$/.test(new URL(uploadUrl).hostname) ? (
              <p className="mt-2 text-xs text-text-muted">
                For a real phone, open this desktop page using your computer’s network IP or an
                HTTPS development URL. Both devices must be able to reach it.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <input
        ref={picker}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        aria-label="Choose page photos"
        disabled={locked}
        onChange={(event) => {
          add(Array.from(event.target.files ?? []));
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="Take a page photo"
        disabled={locked}
        onChange={(event) => {
          add(Array.from(event.target.files ?? []));
          event.currentTarget.value = "";
        }}
      />
      <div className="flex flex-wrap gap-2">
        {phoneLink ? (
          <Button type="button" disabled={locked} onClick={() => camera.current?.click()}>
            <Camera className="mr-2 size-4" />
            Take photo
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={locked || !link}
          onClick={() => picker.current?.click()}
        >
          <Upload className="mr-2 size-4" />
          {phoneLink ? "Choose from gallery" : "Add desktop photos"}
        </Button>
        {sheet?.pages.length || sheet?.pendingCount ? (
          <Button type="button" variant="outline" disabled={locked} onClick={() => remove("all")}>
            Remove all
          </Button>
        ) : null}
      </div>
      {opening ? (
        <p role="status" className="flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" />
          Preparing camera upload…
        </p>
      ) : null}
      {sheet ? (
        <ContentCameraPages
          pages={sheet.pages}
          disabled={locked}
          onReorder={reorder}
          onRemove={remove}
        />
      ) : null}
      {sheet?.pendingCount ? (
        <p role="status" className="text-sm text-text-muted">
          {sheet.pendingCount} photo{sheet.pendingCount === 1 ? " is" : "s are"} arriving…
        </p>
      ) : null}
      {busy ? (
        <p role="status" className="flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" />
          {busy}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {ended ? (
        <p role="status" className="text-sm">
          This camera session has ended. Your desktop can start a new one.
        </p>
      ) : null}
      {!opening && (!sheet || ended) && !phoneLink ? (
        <Button type="button" variant="outline" onClick={() => setRestart((value) => value + 1)}>
          {ended ? "New camera session" : "Retry camera upload"}
        </Button>
      ) : null}
      {sheet?.pages.length ? (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <label className="block text-sm font-medium">
            PDF name
            <input
              type="text"
              value={name}
              disabled={locked}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 block min-h-11 w-full rounded-lg border border-border bg-bg-primary px-3 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!canPdf}
              onClick={() => generate("preview")}
            >
              <FileText className="mr-2 size-4" />
              Preview PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!canPdf}
              onClick={() => generate("download")}
            >
              <Download className="mr-2 size-4" />
              Download PDF
            </Button>
            {onUpload ? (
              <Button type="button" disabled={!canPdf} onClick={() => generate("upload")}>
                Upload PDF and index
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-text-muted">
            The PDF uses the current page order. You can keep adding photos before uploading.
          </p>
        </div>
      ) : null}
      {pdf && pdf.revision === sheet?.revision ? (
        <iframe
          title="Scanned content PDF preview"
          src={pdf.url}
          className="h-96 w-full rounded-xl border border-border"
        />
      ) : null}
    </div>
  );
}
