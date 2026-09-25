import { compressAnswerPhoto } from "@/lib/answer-sheet-photo";

/**
 * Add files to an answer sheet from a browser — the desktop's picker and the
 * phone's camera both come through here, with the sheet's challenge id and token.
 *
 * One file at a time, in the order chosen, so page 3 is page 3. Each is: photo
 * compressed on the device → a signed upload URL from us → the file straight to
 * storage → "it landed", which the server checks against the bucket.
 */

export type SheetSource = "desktop" | "phone";

async function json<T>(response: Response, fallback: string): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || fallback);
  return payload;
}

export function isSheetPdf(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** Which sheet: the challenge it answers and the token from its QR. */
export type SheetLink = { challengeId: string; token: string };

function sheetBase(link: SheetLink) {
  return `/api/answer-sheet/${encodeURIComponent(link.challengeId)}/${encodeURIComponent(link.token)}`;
}

export async function addFilesToSheet(
  link: SheetLink,
  files: File[],
  source: SheetSource,
  onProgress?: (done: number, total: number) => void,
) {
  const base = sheetBase(link);
  const pdfs = files.filter(isSheetPdf);
  if (pdfs.length && (pdfs.length > 1 || files.length > 1)) {
    throw new Error("Add several photos, or one PDF — not both.");
  }
  let done = 0;
  onProgress?.(done, files.length);
  for (const file of files) {
    const prepared = isSheetPdf(file)
      ? { blob: file as Blob, name: file.name, mimeType: "application/pdf" }
      : await compressAnswerPhoto(file).then((photo) => ({
          blob: photo.blob,
          name: photo.name,
          mimeType: "image/jpeg",
        }));
    const { pageId, uploadUrl } = await json<{ pageId: string; uploadUrl: string }>(
      await fetch(`${base}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: prepared.name,
          mimeType: prepared.mimeType,
          size: prepared.blob.size,
          source,
        }),
      }),
      "Could not start the upload.",
    );
    // The same body storage-js sends to a signed upload URL.
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", new File([prepared.blob], prepared.name, { type: prepared.mimeType }));
    const stored = await fetch(uploadUrl, { method: "PUT", headers: { "x-upsert": "false" }, body });
    if (!stored.ok) throw new Error(`${prepared.name} did not upload. Check your connection and try again.`);
    await json(await fetch(`${base}/pages/${pageId}`, { method: "POST" }), "The page could not be saved.");
    done += 1;
    onProgress?.(done, files.length);
  }
}

export async function removeSheetPages(link: SheetLink, pageId: string | "all") {
  const base = sheetBase(link);
  await json(
    await fetch(pageId === "all" ? `${base}/pages` : `${base}/pages/${pageId}`, { method: "DELETE" }),
    "Could not remove that page.",
  );
}

export async function reorderSheetPages(link: SheetLink, order: string[]) {
  await json(
    await fetch(`${sheetBase(link)}/pages`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    }),
    "Could not save the page order.",
  );
}
