import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createVpsStorageClient } from "@/lib/vps-storage";
import {
  CONTENT_CAMERA_MAX_PAGES,
  CONTENT_CAMERA_MAX_PDF_BYTES,
  type ContentCameraPdf,
  type ContentCameraState,
} from "@/lib/content-camera-types";

export const CONTENT_CAMERA_BUCKET = "content-camera";
export type CameraSession = {
  id: string;
  teacher_id: string;
  token_hash: string;
  title: string;
  expires_at: string;
};
type PdfReservation = { id: string; name: string; size: number; pageCount: number };
type ReadyPdf = PdfReservation & { digest: string; uploadedAt: string };
export class ContentCameraError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
const bucket = () => createVpsStorageClient().from(CONTENT_CAMERA_BUCKET);
const root = (id: string) => `handoffs/${id}`;
const hash = (token: string | Buffer) => createHash("sha256").update(token).digest("hex");
const uuid = (id: string) => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id);
async function read<T>(path: string): Promise<T | null> {
  const { data, error } = await bucket().download(path);
  if (error?.statusCode === "404") return null;
  if (error || !data)
    throw new ContentCameraError(
      "Phone uploads are temporarily unavailable. Please try again.",
      503,
    );
  try {
    return JSON.parse(await data.text()) as T;
  } catch {
    throw new ContentCameraError("The phone upload could not be read. Start a new QR link.", 503);
  }
}
async function write(path: string, value: unknown) {
  const { error } = await bucket().upload(path, JSON.stringify(value), {
    contentType: "application/json",
  });
  if (error)
    throw new ContentCameraError("Could not save the phone upload. Please try again.", 503);
}
async function assertActive(session: CameraSession) {
  if (
    Date.parse(session.expires_at) <= Date.now() ||
    (await read(`${root(session.id)}/closed.json`))
  )
    throw new ContentCameraError(
      "This QR link has ended. Open a new phone upload on your desktop.",
      410,
    );
}
export async function createContentCamera(teacherId: string, title: string) {
  const token = randomBytes(32).toString("hex");
  const session: CameraSession = {
    id: randomUUID(),
    teacher_id: teacherId,
    token_hash: hash(token),
    title: title.slice(0, 160),
    expires_at: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
  };
  await write(`${root(session.id)}/session.json`, session);
  return { session, token };
}
export async function getContentCamera(id: string, token: string, allowClosed = false) {
  if (!uuid(id) || !/^[a-f0-9]{64}$/i.test(token))
    throw new ContentCameraError("Invalid phone upload link.", 404);
  const session = await read<CameraSession>(`${root(id)}/session.json`);
  if (
    !session ||
    session.id !== id ||
    !/^[a-f0-9]{64}$/.test(session.token_hash) ||
    !timingSafeEqual(Buffer.from(session.token_hash), Buffer.from(hash(token)))
  )
    throw new ContentCameraError("This phone upload link was not found.", 404);
  if (!allowClosed) await assertActive(session);
  return session;
}
export async function contentCameraState(session: CameraSession): Promise<ContentCameraState> {
  const pdf = await read<ReadyPdf>(`${root(session.id)}/ready.json`);
  return {
    id: session.id,
    title: session.title,
    expiresAt: session.expires_at,
    maxPages: CONTENT_CAMERA_MAX_PAGES,
    pdf: pdf
      ? {
          id: pdf.id,
          name: pdf.name,
          size: pdf.size,
          pageCount: pdf.pageCount,
          uploadedAt: pdf.uploadedAt,
        }
      : null,
  };
}
export async function prepareContentPdf(
  id: string,
  token: string,
  input: { name: string; size: number; pageCount: number },
) {
  const session = await getContentCamera(id, token);
  if (!Number.isInteger(input.size) || input.size < 1 || input.size > CONTENT_CAMERA_MAX_PDF_BYTES)
    throw new ContentCameraError("The PDF must be under 50 MB.", 413);
  if (
    !Number.isInteger(input.pageCount) ||
    input.pageCount < 1 ||
    input.pageCount > CONTENT_CAMERA_MAX_PAGES
  )
    throw new ContentCameraError("Choose between 1 and 50 pages.");
  if ((await contentCameraState(session)).pdf)
    throw new ContentCameraError(
      "A PDF has already been sent. Start a new QR link for another PDF.",
      409,
    );
  const reservation: PdfReservation = {
    ...input,
    id: randomUUID(),
    name:
      (input.name
        .replace(/[\\/\r\n\x00-\x1f]/g, "_")
        .replace(/\.pdf$/i, "")
        .slice(0, 120) || "scanned-content") + ".pdf",
  };
  await write(`${root(id)}/${reservation.id}.json`, reservation);
  const seconds = Math.max(
    1,
    Math.min(300, Math.floor((Date.parse(session.expires_at) - Date.now()) / 1000)),
  );
  const { data } = await bucket().createSignedUploadUrl(
    `${root(id)}/${reservation.id}.pdf`,
    seconds,
  );
  return { pdfId: reservation.id, uploadUrl: data.signedUrl };
}
export async function completeContentPdf(id: string, token: string, pdfId: string) {
  const session = await getContentCamera(id, token);
  if (!uuid(pdfId)) throw new ContentCameraError("Invalid PDF upload.");
  const ready = await read<ReadyPdf>(`${root(id)}/ready.json`);
  if (ready) {
    if (ready.id === pdfId) return session;
    throw new ContentCameraError("Another PDF has already arrived. Start a new QR link.", 409);
  }
  const reservation = await read<PdfReservation>(`${root(id)}/${pdfId}.json`);
  if (!reservation || reservation.id !== pdfId)
    throw new ContentCameraError("That PDF upload was not prepared.", 404);
  const bytes = await pdfBytes(id, reservation);
  const start = bytes.subarray(0, 2048).toString("latin1");
  const count = Number(start.match(/\/Type\s*\/Pages\b[^]*?\/Count\s+(\d+)/)?.[1]);
  if (
    !start.startsWith("%PDF-1.4") ||
    !bytes.subarray(-64).toString("latin1").includes("%%EOF") ||
    count !== reservation.pageCount
  )
    throw new ContentCameraError("This PDF could not be verified. Create it again on your phone.");
  // Closure is a separate immutable marker; publishing a late PDF cannot reopen a link.
  await assertActive(session);
  await write(`${root(id)}/ready.json`, {
    ...reservation,
    digest: hash(bytes),
    uploadedAt: new Date().toISOString(),
  });
  return session;
}
async function pdfBytes(id: string, pdf: Pick<ContentCameraPdf, "id" | "size">) {
  const path = `${root(id)}/${pdf.id}.pdf`;
  const { data: info, error } = await bucket().info(path);
  if (error || !info)
    throw new ContentCameraError("The PDF has not arrived yet. Retry the upload.", 409);
  if (
    info.size !== pdf.size ||
    info.size > CONTENT_CAMERA_MAX_PDF_BYTES ||
    info.mimetype !== "application/pdf"
  )
    throw new ContentCameraError("The uploaded file does not match the prepared PDF.");
  const result = await bucket().download(path);
  if (result.error || !result.data)
    throw new ContentCameraError("Could not read the PDF. Please try again.", 502);
  const bytes = Buffer.from(await result.data.arrayBuffer());
  if (bytes.length !== pdf.size)
    throw new ContentCameraError("The uploaded PDF changed. Start a new scan.", 409);
  return bytes;
}
export async function contentCameraPdf(session: CameraSession, pdfId: string) {
  await assertActive(session);
  const pdf = await read<ReadyPdf>(`${root(session.id)}/ready.json`);
  if (!pdf || pdf.id !== pdfId) throw new ContentCameraError("That PDF was not found.", 404);
  const bytes = await pdfBytes(session.id, pdf);
  if (hash(bytes) !== pdf.digest)
    throw new ContentCameraError("The PDF changed after uploading. Start a new scan.", 409);
  return bytes;
}
export async function closeContentCamera(id: string, token: string) {
  await getContentCamera(id, token, true);
  const marker = `${root(id)}/closed.json`;
  if (!(await read(marker))) {
    const result = await bucket().upload(marker, JSON.stringify({ closed: true }), {
      contentType: "application/json",
    });
    if (result.error && result.error.statusCode !== "409")
      throw new ContentCameraError("Could not close this phone upload. Please try again.", 503);
  }
  const pdf = await read<ReadyPdf>(`${root(id)}/ready.json`);
  if (pdf) await bucket().remove([`${root(id)}/${pdf.id}.pdf`]);
}
/** VPS listing is server-only. Keep closed markers until signed PUTs have expired. */
export async function cleanupContentCameras(limit = 20) {
  let cleaned = 0;
  let after = "";
  do {
    const { data, error } = await bucket().list("handoffs", after);
    if (error)
      throw new ContentCameraError("Phone upload cleanup is temporarily unavailable.", 503);
    for (const folder of data ?? []) {
      if (!uuid(folder.name)) continue;
      const session = await read<CameraSession>(`${root(folder.name)}/session.json`);
      if (!session || Date.parse(session.expires_at) > Date.now() - 5 * 60_000) continue;
      let objectAfter = "";
      do {
        const objects = await bucket().list(root(folder.name), objectAfter);
        if (objects.error) break;
        const result = await bucket().remove(
          (objects.data ?? [])
            .filter((file) => !file.isDirectory)
            .map((file) => `${root(folder.name)}/${file.name}`),
        );
        if (result.error) break;
        objectAfter = objects.data?.length === 1000 ? objects.data.at(-1)!.name : "";
      } while (objectAfter);
      if (++cleaned >= limit) return;
    }
    after = data?.length === 1000 ? data.at(-1)!.name : "";
  } while (after);
}
