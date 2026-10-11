import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createVpsStorageClient } from "@/lib/vps-storage";
import { jpegInfo, jpegsToPdf } from "@/lib/photos-to-pdf";
import {
  CONTENT_CAMERA_MAX_PAGES,
  CONTENT_CAMERA_MAX_PHOTO_BYTES,
  type ContentCameraState,
} from "@/lib/content-camera-types";

export const CONTENT_CAMERA_BUCKET = "content-camera";
type Page = {
  id: string;
  name: string;
  path: string;
  size: number;
  digest?: string;
  source: "phone" | "desktop";
  status: "pending" | "ready" | "removed";
};
export type CameraSession = {
  id: string;
  teacher_id: string;
  token_hash: string;
  title: string;
  expires_at: string;
  revision: number;
  closed: boolean;
  pages: Page[];
};
export class ContentCameraError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
const bucket = () => createVpsStorageClient().from(CONTENT_CAMERA_BUCKET);
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const table = () => createSupabaseAdminClient().from("content_camera_sessions");
const active = (session: CameraSession) => {
  if (session.closed || Date.parse(session.expires_at) <= Date.now()) {
    throw new ContentCameraError(
      "This camera link has ended. Open a new camera session on the desktop.",
      410,
    );
  }
};

export async function createContentCamera(teacherId: string, title: string) {
  const { count, error: countError } = await table()
    .select("id", { count: "exact", head: true })
    .eq("teacher_id", teacherId)
    .eq("closed", false)
    .gt("expires_at", new Date().toISOString());
  if (countError)
    throw new ContentCameraError(
      "Camera uploads need the latest database migration on this deployment.",
      503,
    );
  if ((count ?? 0) >= 10)
    throw new ContentCameraError("Close an existing camera session before opening another.", 429);
  const token = randomBytes(32).toString("hex");
  const { data, error } = await table()
    .insert({ teacher_id: teacherId, token_hash: hash(token), title: title.slice(0, 160) })
    .select("*")
    .single();
  if (error || !data)
    throw new ContentCameraError("Could not start the camera upload. Please try again.", 503);
  return { session: data as CameraSession, token };
}

export async function getContentCamera(id: string, token: string, allowClosed = false) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) || !/^[a-f0-9]{64}$/i.test(token))
    throw new ContentCameraError("Invalid camera link.", 404);
  const { data, error } = await table()
    .select("*")
    .eq("id", id)
    .eq("token_hash", hash(token))
    .maybeSingle();
  if (error) throw new ContentCameraError("Camera uploads are temporarily unavailable.", 503);
  if (!data) throw new ContentCameraError("This camera link was not found.", 404);
  const session = data as CameraSession;
  if (!allowClosed) active(session);
  return session;
}

/** Optimistic compare-and-swap keeps simultaneous phone additions and desktop
 * arrangements from overwriting each other, across workers and deployments. */
async function change(
  id: string,
  token: string,
  update: (session: CameraSession) => Partial<CameraSession>,
) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = await getContentCamera(id, token);
    const patch = update(current);
    const { data, error } = await table()
      .update({ ...patch, revision: current.revision + 1 })
      .eq("id", id)
      .eq("revision", current.revision)
      .eq("closed", false)
      .gt("expires_at", new Date().toISOString())
      .select("*")
      .maybeSingle();
    if (error) throw new ContentCameraError("Could not save the pages. Please try again.", 503);
    if (data) return data as CameraSession;
  }
  throw new ContentCameraError("Pages changed on another device. Please try again.", 409);
}

export async function contentCameraState(session: CameraSession): Promise<ContentCameraState> {
  const ready = session.pages.filter((page) => page.status === "ready");
  const remaining = Math.max(1, Math.floor((Date.parse(session.expires_at) - Date.now()) / 1000));
  const { data } = await bucket().createSignedUrls(
    ready.map((page) => page.path),
    Math.min(900, remaining),
  );
  return {
    id: session.id,
    title: session.title,
    expiresAt: session.expires_at,
    revision: session.revision,
    maxPages: CONTENT_CAMERA_MAX_PAGES,
    pendingCount: session.pages.filter((page) => page.status === "pending").length,
    pages: ready.map((page, index) => ({
      id: page.id,
      name: page.name,
      size: page.size,
      mimeType: "image/jpeg",
      source: page.source,
      previewUrl: data[index]?.signedUrl ?? null,
    })),
  };
}

export async function prepareContentPhoto(
  id: string,
  token: string,
  input: { name: string; size: number; source: string },
) {
  if (
    !Number.isInteger(input.size) ||
    input.size <= 0 ||
    input.size > CONTENT_CAMERA_MAX_PHOTO_BYTES
  ) {
    throw new ContentCameraError("Compress each photo to under 2 MB before sending it.");
  }
  const pageId = randomUUID();
  const storagePath = `${id}/${pageId}.jpg`;
  const session = await change(id, token, (current) => {
    if (
      current.pages.filter((page) => page.status !== "removed").length >= CONTENT_CAMERA_MAX_PAGES
    ) {
      throw new ContentCameraError(`A PDF can contain up to ${CONTENT_CAMERA_MAX_PAGES} photos.`);
    }
    if (current.pages.length >= 120)
      throw new ContentCameraError("Start a new session to add more photos.");
    return {
      pages: [
        ...current.pages,
        {
          id: pageId,
          path: storagePath,
          name: input.name.replace(/[\\/\r\n]/g, "_").slice(0, 120) || "page.jpg",
          size: input.size,
          source: input.source === "phone" ? "phone" : "desktop",
          status: "pending",
        },
      ],
    };
  });
  const seconds = Math.max(
    1,
    Math.min(300, Math.floor((Date.parse(session.expires_at) - Date.now()) / 1000)),
  );
  const { data } = await bucket().createSignedUploadUrl(storagePath, seconds);
  return { pageId, uploadUrl: data.signedUrl };
}

export async function completeContentPhoto(id: string, token: string, pageId: string) {
  const session = await getContentCamera(id, token);
  const page = session.pages.find((item) => item.id === pageId && item.status !== "removed");
  if (!page) throw new ContentCameraError("That page was removed. Add it again.", 409);
  if (page.status === "ready") return session;
  const { data: info, error: infoError } = await bucket().info(page.path);
  if (infoError || !info)
    throw new ContentCameraError("The photo has not arrived. Retry the upload.", 409);
  if (
    info.size !== page.size ||
    info.size > CONTENT_CAMERA_MAX_PHOTO_BYTES ||
    info.mimetype !== "image/jpeg"
  ) {
    throw new ContentCameraError("That upload is not the prepared JPEG photo.");
  }
  const { data, error } = await bucket().download(page.path);
  if (error || !data)
    throw new ContentCameraError("The photo could not be read. Please try again.", 502);
  const bytes = Buffer.from(await data.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  try {
    const shape = jpegInfo(bytes);
    if (
      shape.width < 1 ||
      shape.height < 1 ||
      shape.width > 2000 ||
      shape.height > 2000 ||
      ![1, 3].includes(shape.components)
    )
      throw new Error("size");
  } catch {
    throw new ContentCameraError("That photo could not be opened. Choose a JPG or take it again.");
  }
  return change(id, token, (current) => {
    if (!current.pages.some((item) => item.id === pageId && item.status !== "removed"))
      throw new ContentCameraError("That page was removed.", 409);
    return {
      pages: current.pages.map((item) =>
        item.id === pageId ? { ...item, digest, status: "ready" } : item,
      ),
    };
  });
}

export async function reorderContentPhotos(id: string, token: string, order: string[]) {
  if (order.length > CONTENT_CAMERA_MAX_PAGES || new Set(order).size !== order.length)
    throw new ContentCameraError("Invalid page order.");
  return change(id, token, (current) => {
    const ready = current.pages.filter((page) => page.status === "ready");
    const known = new Set(ready.map((page) => page.id));
    if (order.some((pageId) => !known.has(pageId)))
      throw new ContentCameraError(
        "A page was removed on another device. Refresh and try again.",
        409,
      );
    const byId = new Map(ready.map((page) => [page.id, page]));
    // Append arrivals absent from the desktop's snapshot instead of losing them.
    return {
      pages: [
        ...order.map((pageId) => byId.get(pageId)!),
        ...ready.filter((page) => !order.includes(page.id)),
        ...current.pages.filter((page) => page.status !== "ready"),
      ],
    };
  });
}

export async function removeContentPhoto(id: string, token: string, pageId: string) {
  const session = await change(id, token, (current) => ({
    pages: current.pages.map((page) =>
      page.id === pageId || pageId === "all" ? { ...page, status: "removed" } : page,
    ),
  }));
  const paths = session.pages.filter((page) => page.status === "removed").map((page) => page.path);
  if (paths.length) await bucket().remove(paths);
  return session;
}

export async function closeContentCamera(id: string, token: string) {
  const session = await getContentCamera(id, token, true);
  const { error } = await table()
    .update({ closed: true, revision: session.revision + 1 })
    .eq("id", id)
    .eq("token_hash", hash(token));
  if (error) throw new ContentCameraError("Could not end the camera session.", 503);
  // Keep tombstones until expiry so cleanup can remove even a signed upload
  // that was already in flight when the session was closed.
  if (session.pages.length) await bucket().remove(session.pages.map((page) => page.path));
}

export async function contentCameraPdf(session: CameraSession, revision: number) {
  active(session);
  if (revision !== session.revision || session.pages.some((page) => page.status === "pending")) {
    throw new ContentCameraError(
      "Pages are still arriving or have changed. Refresh before creating the PDF.",
      409,
    );
  }
  const ready = session.pages.filter((page) => page.status === "ready");
  if (!ready.length) throw new ContentCameraError("Add at least one photo first.");
  const photos: Buffer[] = [];
  for (const page of ready) {
    const { data: info } = await bucket().info(page.path);
    if (!info || info.size !== page.size || info.size > CONTENT_CAMERA_MAX_PHOTO_BYTES) {
      throw new ContentCameraError(
        "A photo changed after uploading. Remove it and add it again.",
        409,
      );
    }
    const { data, error } = await bucket().download(page.path);
    if (error || !data)
      throw new ContentCameraError("A photo could not be read. Please try again.", 502);
    const bytes = Buffer.from(await data.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== page.digest) {
      throw new ContentCameraError(
        "A photo changed after uploading. Remove it and add it again.",
        409,
      );
    }
    photos.push(bytes);
  }
  return jpegsToPdf(photos);
}

/** Run periodically, and on session creation. No Supabase Storage is involved. */
export async function cleanupContentCameras(limit = 20) {
  const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data, error } = await table()
    .select("*")
    .lt("expires_at", cutoff)
    .order("expires_at")
    .limit(limit);
  if (error)
    throw new ContentCameraError("Camera session cleanup could not read expired sessions.", 503);
  for (const session of (data ?? []) as CameraSession[]) {
    const paths = session.pages.map((page) => page.path);
    const result = paths.length ? await bucket().remove(paths) : { error: null };
    if (!result.error) await table().delete().eq("id", session.id).lt("expires_at", cutoff);
  }
}
