import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * The Drive import queue.
 *
 * A row is a complete instruction — the pasted link, the Drive file id and the
 * destination folder — so the worker that picks it up needs nothing from the
 * session that enqueued it. That is the whole point: the creator pastes a folder
 * link, presses import, and closes the dialog. Twenty files then arrive over the
 * next few minutes whether or not the tab is open.
 *
 * See supabase/migrations/20260914120000_teacher_drive_import_queue.sql for the
 * claim semantics — one worker per row, stale claims reclaimed, three strikes.
 */

/** Postgres codes for "the migration has not been run here". */
const UNDEFINED_TABLE = "42P01";
const POSTGREST_MISSING_TABLE = "PGRST205";
const UNDEFINED_FUNCTION = "42883";
const POSTGREST_MISSING_FUNCTION = "PGRST202";
/** A double-submitted dialog racing itself; the first row already covers it. */
const UNIQUE_VIOLATION = "23505";

export function isMissingDriveQueue(error: { code?: string } | null) {
  return (
    error?.code === UNDEFINED_TABLE ||
    error?.code === POSTGREST_MISSING_TABLE ||
    error?.code === UNDEFINED_FUNCTION ||
    error?.code === POSTGREST_MISSING_FUNCTION
  );
}

export type DriveImportStatus = "queued" | "importing" | "done" | "failed";

export type DriveImportItem = {
  id: string;
  driveFileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  destinationPath: string;
  shelf: string;
  sourceLink: string;
  status: DriveImportStatus;
  attempts: number;
  error: string;
  warning: string;
  documentId: string;
  jobId: string;
  createdAt: string;
  finishedAt: string;
};

export type DriveImportEnqueueInput = {
  driveFileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  destinationPath: string;
  shelf: string;
  sourceLink: string;
};

type QueueRow = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toItem(row: QueueRow): DriveImportItem {
  return {
    id: text(row.id),
    driveFileId: text(row.drive_file_id),
    fileName: text(row.file_name),
    mimeType: text(row.mime_type),
    sizeBytes: Number(row.size_bytes) || 0,
    destinationPath: text(row.destination_path),
    shelf: text(row.shelf),
    sourceLink: text(row.source_link),
    status: (text(row.status) || "queued") as DriveImportStatus,
    attempts: Number(row.attempts) || 0,
    error: text(row.error),
    warning: text(row.warning),
    documentId: text(row.document_id),
    jobId: text(row.job_id),
    createdAt: text(row.created_at),
    finishedAt: text(row.finished_at),
  };
}

const COLUMNS =
  "id,drive_file_id,file_name,mime_type,size_bytes,destination_path,shelf,source_link," +
  "status,attempts,error,warning,document_id,job_id,created_at,finished_at";

/**
 * Add files to the queue. Returns what is now queued for this creator.
 *
 * A file already in flight to the same folder is silently kept rather than
 * duplicated — the partial unique index enforces it, and a creator who
 * double-clicks Import should get one import, not an error.
 */
export async function enqueueDriveImports(
  teacherId: string,
  items: DriveImportEnqueueInput[],
): Promise<{ queued: DriveImportItem[]; unavailable: boolean }> {
  if (!items.length) return { queued: [], unavailable: false };
  const admin = createSupabaseAdminClient();
  const queued: DriveImportItem[] = [];

  /**
   * A file being queued again REPLACES its own failed row.
   *
   * Re-pasting the link is the other way a creator retries — the one they reach
   * for when the dialog has long since closed — and without this the queue then
   * shows the same document twice, once Failed and once Queued, with no way to
   * tell that the failure is the stale one. The partial unique index only covers
   * rows still in flight, so the insert below would happily go through; it is
   * the reading of it that would mislead.
   */
  const byPath = new Map<string, string[]>();
  for (const item of items) {
    const list = byPath.get(item.destinationPath) ?? [];
    list.push(item.driveFileId);
    byPath.set(item.destinationPath, list);
  }
  for (const [path, fileIds] of byPath) {
    const { error } = await admin
      .from("teacher_drive_imports")
      .delete()
      .eq("teacher_id", teacherId)
      .eq("destination_path", path)
      .eq("status", "failed")
      .in("drive_file_id", fileIds);
    if (isMissingDriveQueue(error)) return { queued: [], unavailable: true };
    if (error) throw error;
  }

  // One insert per row rather than one batch: a batch that trips the "already in
  // flight" index fails whole, which would turn one duplicate into nineteen
  // files that never got queued.
  for (const item of items) {
    const { data, error } = await admin
      .from("teacher_drive_imports")
      .insert({
        teacher_id: teacherId,
        drive_file_id: item.driveFileId,
        file_name: item.fileName,
        mime_type: item.mimeType,
        size_bytes: Math.max(0, Math.round(item.sizeBytes)),
        destination_path: item.destinationPath,
        shelf: item.shelf,
        source_link: item.sourceLink,
      })
      .select(COLUMNS)
      .single();
    if (isMissingDriveQueue(error)) return { queued: [], unavailable: true };
    if (error?.code === UNIQUE_VIOLATION) continue;
    if (error) throw error;
    queued.push(toItem(data as unknown as QueueRow));
  }
  return { queued, unavailable: false };
}

/** The queue as the dialog shows it: newest first, recent history included so a
 *  creator who reopens it can see what succeeded and what did not. */
export async function listDriveImports(
  teacherId: string,
  limit = 60,
): Promise<{ items: DriveImportItem[]; unavailable: boolean }> {
  const admin = createSupabaseAdminClient();
  // Sweep abandoned claims first, so a row whose worker died reads as failed
  // rather than sitting at "Importing" forever.
  const expired = await admin.rpc("expire_teacher_drive_imports", {
    target_teacher_id: teacherId,
  });
  if (isMissingDriveQueue(expired.error)) return { items: [], unavailable: true };

  const { data, error } = await admin
    .from("teacher_drive_imports")
    .select(COLUMNS)
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (isMissingDriveQueue(error)) return { items: [], unavailable: true };
  if (error) throw error;
  return { items: ((data ?? []) as unknown as QueueRow[]).map(toItem), unavailable: false };
}

/** Take the next import for this creator, or null when the queue is empty. */
export async function claimNextDriveImport(teacherId: string): Promise<DriveImportItem | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("claim_teacher_drive_import", {
    target_teacher_id: teacherId,
  });
  if (isMissingDriveQueue(error)) return null;
  if (error) throw error;
  const rows = (data ?? []) as QueueRow[];
  return rows.length ? toItem(rows[0]) : null;
}

export async function completeDriveImport(
  id: string,
  outcome: { documentId: string; jobId: string; fileName: string; warning: string },
) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("teacher_drive_imports")
    .update({
      status: "done",
      error: "",
      warning: outcome.warning,
      document_id: outcome.documentId,
      job_id: outcome.jobId,
      // Drive only names the file once the bytes arrive on the keyless path, so
      // the row's name is corrected here rather than left as the placeholder.
      file_name: outcome.fileName,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (!isMissingDriveQueue(error) && error) throw error;
}

export async function failDriveImport(id: string, message: string, fileName = "") {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("teacher_drive_imports")
    .update({
      status: "failed",
      error: message.slice(0, 500),
      // Whatever name the worker learned before failing, for the same reason
      // `completeDriveImport` corrects it: a failed row is the one a creator
      // most needs to recognise.
      ...(fileName ? { file_name: fileName } : {}),
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (!isMissingDriveQueue(error) && error) throw error;
}

/**
 * Put failed imports back on the queue.
 *
 * A retry needs nothing from the dialog that queued the file: the row already
 * carries the pasted link, the Drive file id and the destination, so this works
 * from the Activity page, from another device, and a week later. Which is the
 * point — the failures worth retrying are timeouts and half-finished indexes,
 * and those are discovered long after the dialog has closed.
 *
 * `attempts` goes back to 0 deliberately. It is the strike count the claim
 * function reads, and a row that reached three strikes would otherwise be
 * ineligible for the very reclaim that a retry is asking for.
 */
export async function retryDriveImports(
  teacherId: string,
  ids?: string[],
): Promise<{ retried: number; unavailable: boolean }> {
  const admin = createSupabaseAdminClient();
  let query = admin
    .from("teacher_drive_imports")
    .select("id")
    .eq("teacher_id", teacherId)
    .eq("status", "failed");
  // No ids means "everything that failed" — the one-button retry on the panel.
  if (ids?.length) query = query.in("id", ids);
  const { data, error } = await query;
  if (isMissingDriveQueue(error)) return { retried: 0, unavailable: true };
  if (error) throw error;

  let retried = 0;
  for (const row of (data ?? []) as unknown as QueueRow[]) {
    const id = text(row.id);
    if (!id) continue;
    const { error: requeueError } = await admin
      .from("teacher_drive_imports")
      .update({
        status: "queued",
        attempts: 0,
        error: "",
        warning: "",
        claimed_at: null,
        finished_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("teacher_id", teacherId)
      // Only from `failed`: a drain may have picked this row up between the read
      // above and here, and resetting a live import would hand it to a second
      // worker and upload the document twice.
      .eq("status", "failed");
    if (requeueError?.code === UNIQUE_VIOLATION) {
      // The same file is already in flight to the same folder — a re-pasted link
      // got there first. That import covers this row, so the stale failure goes
      // rather than sitting under the running one.
      await admin.from("teacher_drive_imports").delete().eq("id", id).eq("teacher_id", teacherId);
      retried += 1;
      continue;
    }
    if (isMissingDriveQueue(requeueError)) return { retried, unavailable: true };
    if (requeueError) throw requeueError;
    retried += 1;
  }
  return { retried, unavailable: false };
}

/** Clear finished rows the creator has read. Failures are kept until asked. */
export async function clearFinishedDriveImports(teacherId: string, includeFailed: boolean) {
  const admin = createSupabaseAdminClient();
  const statuses = includeFailed ? ["done", "failed"] : ["done"];
  const { error } = await admin
    .from("teacher_drive_imports")
    .delete()
    .eq("teacher_id", teacherId)
    .in("status", statuses);
  if (!isMissingDriveQueue(error) && error) throw error;
}
