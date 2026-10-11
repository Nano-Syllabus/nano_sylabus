import { uploadVpsFile } from "@/lib/vps-storage-upload";
import { photoPagesToPdf } from "@/lib/browser-photo-pdf";
import {
  CONTENT_CAMERA_MAX_PDF_BYTES,
  type ContentCameraLink,
  type ContentCameraPhoto,
  type ContentCameraState,
} from "@/lib/content-camera-types";

export function contentCameraApi(link: ContentCameraLink) {
  return `/api/content-camera/${encodeURIComponent(link.id)}/${encodeURIComponent(link.token)}`;
}
export async function cameraPayload<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "The phone upload could not be completed.");
  return payload as T;
}
export function cameraPdfFile(pages: ContentCameraPhoto[], name: string) {
  const blob = photoPagesToPdf(pages);
  if (blob.size > CONTENT_CAMERA_MAX_PDF_BYTES)
    throw new Error("This PDF is over 50 MB. Use fewer pages and create another scan.");
  return new File(
    [blob],
    `${
      name
        .trim()
        .replace(/[\\/\r\n]/g, "_")
        .replace(/\.pdf$/i, "") || "scanned-content"
    }.pdf`,
    { type: "application/pdf" },
  );
}
export async function sendCameraPdf(
  link: ContentCameraLink,
  file: File,
  pageCount: number,
  onProgress: (note: string) => void,
) {
  onProgress("Preparing secure PDF upload…");
  const prepared = await fetch(contentCameraApi(link), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "prepare-pdf", name: file.name, size: file.size, pageCount }),
  }).then(cameraPayload<{ pdfId: string; uploadUrl: string }>);
  onProgress("Uploading your PDF…");
  await uploadVpsFile(prepared.uploadUrl, file, "application/pdf");
  onProgress("Confirming your desktop received it…");
  return fetch(contentCameraApi(link), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "complete-pdf", pdfId: prepared.pdfId }),
  }).then(cameraPayload<ContentCameraState>);
}
export async function receivedCameraPdf(
  link: ContentCameraLink,
  pdf: NonNullable<ContentCameraState["pdf"]>,
) {
  const response = await fetch(`${contentCameraApi(link)}?pdf=${encodeURIComponent(pdf.id)}`, {
    cache: "no-store",
  });
  if (!response.ok) await cameraPayload(response);
  return new File([await response.blob()], pdf.name, { type: "application/pdf" });
}
