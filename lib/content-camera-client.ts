import { compressAnswerPhoto } from "@/lib/answer-sheet-photo";
import { uploadVpsFile } from "@/lib/vps-storage-upload";
import type { ContentCameraLink, ContentCameraState } from "@/lib/content-camera-types";

export function contentCameraApi(link: ContentCameraLink) {
  return `/api/content-camera/${encodeURIComponent(link.id)}/${encodeURIComponent(link.token)}`;
}
export async function cameraPayload<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "The camera upload could not be completed.");
  return payload as T;
}
export function changeCamera(link: ContentCameraLink, body: Record<string, unknown>) {
  return fetch(contentCameraApi(link), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(cameraPayload<ContentCameraState>);
}
export async function addCameraPhotos(
  link: ContentCameraLink,
  files: File[],
  source: "phone" | "desktop",
  onProgress: (note: string) => void,
) {
  for (const [index, file] of files.entries()) {
    onProgress(`Sending photo ${index + 1} of ${files.length}…`);
    const photo = await compressAnswerPhoto(file);
    const prepared = await fetch(contentCameraApi(link), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "prepare", name: photo.name, size: photo.blob.size, source }),
    }).then(cameraPayload<{ pageId: string; uploadUrl: string }>);
    try {
      await uploadVpsFile(prepared.uploadUrl, photo.blob, "image/jpeg");
      await changeCamera(link, { action: "complete", pageId: prepared.pageId });
    } catch (cause) {
      // Release failed reservations so they cannot block PDF creation.
      await changeCamera(link, { action: "remove", pageId: prepared.pageId }).catch(
        () => undefined,
      );
      throw cause;
    }
  }
}
export async function makeCameraPdf(link: ContentCameraLink, revision: number, name: string) {
  const response = await fetch(`${contentCameraApi(link)}?pdf=1&revision=${revision}`, {
    cache: "no-store",
  });
  if (!response.ok) await cameraPayload(response);
  const blob = await response.blob();
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
