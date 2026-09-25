import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * A CHALLENGE'S ANSWER SHEET, collected page by page before it is submitted.
 *
 * The upload screen shows a QR. Scanning it opens `/answer-sheet/<challengeId>/<token>` on a
 * phone — no sign-in, the token is the permission, the way the payment receipt
 * handoff works — where the student photographs each page. The desktop's own
 * picker adds pages to the same sheet, and the desktop shows every page as it
 * lands, from either side.
 *
 * A sheet is SEVERAL PHOTOS or ONE PDF, never a mix: a PDF is already a whole
 * sheet, and splicing photos into it would be guessing at page order. Photos are
 * compressed on the device (`lib/answer-sheet-photo.ts`) and always arrive as
 * JPEG. Every file goes from the device straight to the private bucket through
 * a signed upload URL, so a 20 MB PDF is never an app request body.
 *
 * Submitting joins the photos into one PDF (`jpegsToPdf`), grades that, and
 * keeps its path on the session: the sheet stays attached to its challenge.
 */

export const ANSWER_SHEET_BUCKET = "challenge-answer-sheets";
export const MAX_SHEET_PAGES = 20;
/** Per photo, after compression on the device — a compressed page is ~0.5 MB. */
export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
/** At least this long, however close the exam clock is: a phone takes a minute. */
const MIN_SESSION_MS = 30 * 60_000;
const MAX_SESSION_MS = 3 * 60 * 60_000;
/** A signed preview outlives several desktop polls, so a thumbnail never flickers. */
const PREVIEW_SECONDS = 15 * 60;

export type SheetMime = "image/jpeg" | "application/pdf";
export type SheetSource = "desktop" | "phone";

export type AnswerSheetPage = {
  id: string;
  name: string;
  mimeType: SheetMime;
  size: number;
  source: SheetSource;
  /** Signed, short-lived; photos only. */
  previewUrl: string | null;
};

export type AnswerSheetState = {
  sessionId: string;
  status: "open" | "submitted" | "expired";
  expiresAt: string;
  kind: "photos" | "pdf" | "empty";
  pages: AnswerSheetPage[];
  maxPages: number;
};

/** Refused for a reason the student can act on; `status` is the HTTP status to answer. */
export class AnswerSheetError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AnswerSheetError";
  }
}

type SessionRow = {
  id: string;
  challenge_id: string;
  user_id: string;
  status: "open" | "submitted" | "expired";
  sheet_path: string | null;
  expires_at: string;
};

type PageRow = {
  id: string;
  storage_path: string;
  mime_type: SheetMime;
  original_name: string;
  size_bytes: number;
  source: SheetSource;
  status: "pending" | "ready";
};

const SESSION_COLUMNS = "id,challenge_id,user_id,status,sheet_path,expires_at";
const PAGE_COLUMNS = "id,storage_path,mime_type,original_name,size_bytes,source,status";
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function expired(session: Pick<SessionRow, "expires_at">) {
  return Date.parse(session.expires_at) <= Date.now();
}

async function readChallenge(userId: string, challengeId: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from("student_challenges")
    .select("id,status,topic_title,subject_name,examExpiresAt:content->>examExpiresAt")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as {
    id: string;
    status: string;
    topic_title: string | null;
    subject_name: string | null;
    examExpiresAt: string | null;
  } | null;
}

function sessionExpiry(examExpiresAt: string | null) {
  const exam = Date.parse(examExpiresAt || "");
  const now = Date.now();
  const wanted = Number.isFinite(exam) ? exam + 10 * 60_000 : now + MIN_SESSION_MS;
  return new Date(Math.min(now + MAX_SESSION_MS, Math.max(now + MIN_SESSION_MS, wanted))).toISOString();
}

/**
 * The sheet for this challenge, with a NEW token for its QR.
 *
 * An open sheet is kept rather than replaced — reloading the page must not throw
 * away the four photos already taken — but its token is rotated, since only its
 * hash is stored and the QR has to be drawn again. A QR from before stops working,
 * which is the safe way round.
 */
export async function openAnswerSheet(userId: string, challengeId: string) {
  const challenge = await readChallenge(userId, challengeId);
  if (!challenge) throw new AnswerSheetError("Challenge not found.", 404);
  if (challenge.status === "completed") throw new AnswerSheetError("This challenge is already complete.", 409);
  const admin = createSupabaseAdminClient();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = sessionExpiry(challenge.examExpiresAt);

  const { data: current, error: readError } = await admin
    .from("challenge_answer_sheet_sessions")
    .select(SESSION_COLUMNS)
    .eq("user_id", userId)
    .eq("challenge_id", challengeId)
    .eq("status", "open")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) throw readError;

  let session: SessionRow;
  if (current) {
    const { data, error } = await admin
      .from("challenge_answer_sheet_sessions")
      .update({ token_hash: hashToken(token), expires_at: expiresAt })
      .eq("id", (current as SessionRow).id)
      .select(SESSION_COLUMNS)
      .single();
    if (error) throw error;
    session = data as SessionRow;
  } else {
    const { data, error } = await admin
      .from("challenge_answer_sheet_sessions")
      .insert({ token_hash: hashToken(token), challenge_id: challengeId, user_id: userId, expires_at: expiresAt })
      .select(SESSION_COLUMNS)
      .single();
    if (error) throw error;
    session = data as SessionRow;
  }
  return { token, state: await sheetState(session) };
}

/** The desktop's view of its own sheet, for polling. */
export async function answerSheetForUser(userId: string, challengeId: string, sessionId: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from("challenge_answer_sheet_sessions")
    .select(SESSION_COLUMNS)
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("challenge_id", challengeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AnswerSheetError("Upload session not found.", 404);
  return data as SessionRow;
}

/**
 * The sheet a phone's token opens, if it may still be added to. Everything a
 * token-holder can do goes through here, so a link for a submitted, expired or
 * finished challenge is refused in one place.
 */
export async function answerSheetForToken(challengeId: string, token: string) {
  if (!TOKEN.test(token) || !UUID.test(challengeId)) throw new AnswerSheetError("This upload link is invalid.", 404);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("challenge_answer_sheet_sessions")
    .select(SESSION_COLUMNS)
    .eq("token_hash", hashToken(token))
    // The challenge is in the link as well as behind the token: a token never
    // opens a sheet for any challenge but the one its URL names.
    .eq("challenge_id", challengeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AnswerSheetError("This upload link is invalid or was replaced by a newer QR.", 404);
  const session = data as SessionRow;
  if (session.status === "submitted") {
    throw new AnswerSheetError("This answer sheet has already been submitted.", 409);
  }
  if (session.status === "expired" || expired(session)) {
    throw new AnswerSheetError("This upload link has expired. Show the QR again on your computer.", 410);
  }
  const challenge = await readChallenge(session.user_id, session.challenge_id);
  if (!challenge || challenge.status === "completed") {
    throw new AnswerSheetError("This challenge is already complete.", 409);
  }
  return {
    session,
    topicTitle: String(challenge.topic_title || ""),
    subjectName: String(challenge.subject_name || ""),
  };
}

function assertWritable(session: SessionRow) {
  if (session.status !== "open") throw new AnswerSheetError("This answer sheet has already been submitted.", 409);
  if (expired(session)) throw new AnswerSheetError("This upload session expired. Show the QR again.", 410);
}

async function readyPages(sessionId: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from("challenge_answer_sheet_pages")
    .select(PAGE_COLUMNS)
    .eq("session_id", sessionId)
    .eq("status", "ready")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PageRow[];
}

export async function sheetState(session: SessionRow): Promise<AnswerSheetState> {
  const rows = await readyPages(session.id);
  const photos = rows.filter((row) => row.mime_type === "image/jpeg");
  const previews = new Map<string, string>();
  if (photos.length) {
    const { data } = await createSupabaseAdminClient()
      .storage.from(ANSWER_SHEET_BUCKET)
      .createSignedUrls(
        photos.map((row) => row.storage_path),
        PREVIEW_SECONDS,
      );
    for (const item of data ?? []) if (item.path && item.signedUrl) previews.set(item.path, item.signedUrl);
  }
  return {
    sessionId: session.id,
    status: session.status === "open" && expired(session) ? "expired" : session.status,
    expiresAt: session.expires_at,
    kind: !rows.length ? "empty" : rows.some((row) => row.mime_type === "application/pdf") ? "pdf" : "photos",
    pages: rows.map((row) => ({
      id: row.id,
      name: row.original_name,
      mimeType: row.mime_type,
      size: row.size_bytes,
      source: row.source,
      previewUrl: previews.get(row.storage_path) ?? null,
    })),
    maxPages: MAX_SHEET_PAGES,
  };
}

/**
 * Hand out a signed URL for ONE file. The page row is written `pending` first
 * so a file cannot land somewhere this table does not know about.
 */
export async function reserveAnswerSheetPage(
  session: SessionRow,
  file: { name: string; mimeType: string; size: number; source: SheetSource },
) {
  assertWritable(session);
  const mimeType = file.mimeType as SheetMime;
  if (mimeType !== "image/jpeg" && mimeType !== "application/pdf") {
    throw new AnswerSheetError("Add photos or one PDF.", 400);
  }
  const limit = mimeType === "application/pdf" ? MAX_PDF_BYTES : MAX_PHOTO_BYTES;
  if (!(file.size > 0) || file.size > limit) {
    throw new AnswerSheetError(
      mimeType === "application/pdf" ? "The PDF must be under 20 MB." : "That photo is too large even after compressing.",
      413,
    );
  }
  const pages = await readyPages(session.id);
  if (pages.some((page) => page.mime_type === "application/pdf")) {
    throw new AnswerSheetError("This sheet is already a PDF. Remove it to add photos or another PDF.", 409);
  }
  if (mimeType === "application/pdf" && pages.length) {
    throw new AnswerSheetError("A PDF has to be the whole sheet. Remove the photos first, or keep adding photos.", 409);
  }
  if (pages.length >= MAX_SHEET_PAGES) {
    throw new AnswerSheetError(`An answer sheet can have up to ${MAX_SHEET_PAGES} photos.`, 409);
  }

  const admin = createSupabaseAdminClient();
  const path = `${session.user_id}/${session.challenge_id}/${session.id}/${randomUUID()}.${
    mimeType === "application/pdf" ? "pdf" : "jpg"
  }`;
  const { data: page, error } = await admin
    .from("challenge_answer_sheet_pages")
    .insert({
      session_id: session.id,
      storage_path: path,
      mime_type: mimeType,
      original_name: file.name.slice(0, 200),
      size_bytes: Math.round(file.size),
      source: file.source,
    })
    .select("id")
    .single();
  if (error) throw error;
  const { data: signed, error: signError } = await admin.storage
    .from(ANSWER_SHEET_BUCKET)
    .createSignedUploadUrl(path);
  if (signError || !signed) {
    await admin.from("challenge_answer_sheet_pages").delete().eq("id", page.id);
    throw signError ?? new Error("Could not prepare the upload.");
  }
  return { pageId: String(page.id), uploadUrl: signed.signedUrl };
}

/** The device says the file landed; believe the bucket, not the device. */
export async function commitAnswerSheetPage(session: SessionRow, pageId: string) {
  assertWritable(session);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("challenge_answer_sheet_pages")
    .select(PAGE_COLUMNS)
    .eq("id", pageId)
    .eq("session_id", session.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AnswerSheetError("That page is not on this sheet.", 404);
  const page = data as PageRow;
  if (page.status === "ready") return;
  const { data: info, error: infoError } = await admin.storage.from(ANSWER_SHEET_BUCKET).info(page.storage_path);
  if (infoError || !info) throw new AnswerSheetError("The file did not arrive. Try that page again.", 409);
  const limit = page.mime_type === "application/pdf" ? MAX_PDF_BYTES : MAX_PHOTO_BYTES;
  const size = Number(info.size ?? page.size_bytes);
  if (size > limit) {
    await removeAnswerSheetPages(session, [page.id]);
    throw new AnswerSheetError("That file is too large.", 413);
  }
  const { error: updateError } = await admin
    .from("challenge_answer_sheet_pages")
    .update({ status: "ready", size_bytes: size })
    .eq("id", page.id);
  if (updateError) throw updateError;
}

/** Remove some pages, or all of them (`pageIds` null). */
export async function removeAnswerSheetPages(session: SessionRow, pageIds: string[] | null) {
  assertWritable(session);
  const admin = createSupabaseAdminClient();
  let query = admin.from("challenge_answer_sheet_pages").select("id,storage_path").eq("session_id", session.id);
  if (pageIds) query = query.in("id", pageIds);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; storage_path: string }>;
  if (!rows.length) return;
  const { error: deleteError } = await admin
    .from("challenge_answer_sheet_pages")
    .delete()
    .in(
      "id",
      rows.map((row) => row.id),
    );
  if (deleteError) throw deleteError;
  await admin.storage
    .from(ANSWER_SHEET_BUCKET)
    .remove(rows.map((row) => row.storage_path))
    .catch(() => undefined);
}

/**
 * The sheet as the ONE file the grader reads: the PDF as uploaded, or the photos
 * joined into a PDF in the order they were added. Also stores that joined PDF,
 * so the graded sheet stays attached to the challenge.
 */
export async function answerSheetForGrading(userId: string, challengeId: string, sessionId: string) {
  const session = await answerSheetForUser(userId, challengeId, sessionId);
  assertWritable(session);
  const pages = await readyPages(session.id);
  if (!pages.length) throw new AnswerSheetError("Add your answer sheet first — photos or one PDF.", 400);
  const admin = createSupabaseAdminClient();
  const bucket = admin.storage.from(ANSWER_SHEET_BUCKET);
  const buffers = await Promise.all(
    pages.map(async (page) => {
      const { data, error } = await bucket.download(page.storage_path);
      if (error || !data) throw new AnswerSheetError("A page could not be read back. Remove it and add it again.", 409);
      return Buffer.from(await data.arrayBuffer());
    }),
  );

  if (pages[0].mime_type === "application/pdf") {
    if (buffers[0].subarray(0, 5).toString("latin1") !== "%PDF-") {
      throw new AnswerSheetError("That file is not a PDF. Upload the PDF again.", 400);
    }
    return { session, sheetPath: pages[0].storage_path, file: sheetFile(buffers[0], pages.length) };
  }
  let pdf: Buffer;
  try {
    pdf = jpegsToPdf(buffers);
  } catch {
    throw new AnswerSheetError("One of the photos could not be read. Remove it and take it again.", 400);
  }
  const sheetPath = `${session.user_id}/${session.challenge_id}/${session.id}/answer-sheet.pdf`;
  const { error } = await bucket.upload(sheetPath, pdf, { contentType: "application/pdf", upsert: true });
  if (error) throw error;
  return { session, sheetPath, file: sheetFile(pdf, pages.length) };
}

function sheetFile(buffer: Buffer, pages: number) {
  return { name: `answer-sheet-${pages}-page${pages === 1 ? "" : "s"}.pdf`, mimeType: "application/pdf", buffer };
}

/** After a successful grade: the sheet is closed and keeps the file it was graded on. */
export async function markAnswerSheetSubmitted(sessionId: string, sheetPath: string) {
  const { error } = await createSupabaseAdminClient()
    .from("challenge_answer_sheet_sessions")
    .update({ status: "submitted", sheet_path: sheetPath, submitted_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw error;
}

/* --------------------------------------------------------------------------
 * Photos → one PDF, with no dependency: each JPEG is embedded as it is
 * (DCTDecode), one page per photo, A4-wide. No re-encoding, so no quality lost
 * and no image library on the server.
 * ------------------------------------------------------------------------ */

/** Width, height and colour components from a JPEG's frame header. */
export function jpegInfo(jpeg: Buffer) {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("not a JPEG");
  let offset = 2;
  while (offset + 9 < jpeg.length) {
    if (jpeg[offset] !== 0xff) throw new Error("corrupt JPEG");
    const marker = jpeg[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    const length = jpeg.readUInt16BE(offset + 2);
    // SOF0-SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        height: jpeg.readUInt16BE(offset + 5),
        width: jpeg.readUInt16BE(offset + 7),
        components: jpeg[offset + 9],
      };
    }
    offset += 2 + length;
  }
  throw new Error("JPEG has no frame header");
}

export function jpegsToPdf(jpegs: Buffer[]) {
  const PAGE_WIDTH = 595.28; // A4, in points
  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: Buffer | string) => {
    const buffer = typeof part === "string" ? Buffer.from(part, "latin1") : part;
    chunks.push(buffer);
    length += buffer.length;
  };
  const object = (id: number, body: () => void) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body();
    push("\nendobj\n");
  };

  // 1 catalog, 2 pages, then per photo: page, image, contents.
  const pageIds = jpegs.map((_, index) => 3 + index * 3);
  push("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
  object(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  object(2, () => push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${jpegs.length} >>`));
  jpegs.forEach((jpeg, index) => {
    const { width, height, components } = jpegInfo(jpeg);
    const colour = components === 1 ? "/DeviceGray" : components === 4 ? "/DeviceCMYK" : "/DeviceRGB";
    const pageHeight = (PAGE_WIDTH * height) / width;
    const [pageId, imageId, contentId] = [pageIds[index], pageIds[index] + 1, pageIds[index] + 2];
    const draw = `q ${PAGE_WIDTH.toFixed(2)} 0 0 ${pageHeight.toFixed(2)} 0 0 cm /Im0 Do Q`;
    object(pageId, () =>
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${pageHeight.toFixed(2)}] ` +
          `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      ),
    );
    object(imageId, () => {
      push(
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${colour} ` +
          `/BitsPerComponent 8 /Filter /DCTDecode${components === 4 ? " /Decode [1 0 1 0 1 0 1 0]" : ""} /Length ${jpeg.length} >>\nstream\n`,
      );
      push(jpeg);
      push("\nendstream");
    });
    object(contentId, () => push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`));
  });
  const count = 3 + jpegs.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id += 1) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(chunks);
}
