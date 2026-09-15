import {
  claimNextDriveImport,
  completeDriveImport,
  failDriveImport,
  type DriveImportItem,
} from "@/lib/data/teacher-drive-queue";
import { downloadDriveFile, DriveLinkError, type DriveEntry } from "@/lib/google-drive";
import {
  indexedDocumentId,
  jobId,
  safeFilename,
  savePreviewFromBuffer,
  uploadAndIndex,
  validateDestination,
} from "@/lib/teacher-document-import";
import {
  isTeacherUploadFileSupported,
  teacherUploadShelf,
  teacherUploadSizeError,
} from "@/lib/teacher-upload";

/**
 * Working the Drive import queue down.
 *
 * A module rather than part of the queue route, because two routes start a
 * drain: `POST /api/teacher/drive-queue` (the dialog's nudge) and the enqueue
 * branch of `POST /api/teacher/upload`, which fires one off and does not wait
 * for it. A Next route file may only export its handlers, so the shared piece
 * cannot live in either of them.
 *
 * Draining is at-least-once and may run concurrently. That is handled where it
 * has to be — `claim_teacher_drive_import` hands one row to one worker — rather
 * than by assuming only one drain is ever in flight.
 */

/** Stop claiming new work with this much of the budget left, so the item in hand
 *  finishes and is recorded rather than being killed mid-import and retried. */
const DRAIN_BUDGET_MS = 240_000;

async function importOne(collectionKey: string, teacherId: string, item: DriveImportItem) {
  // The destination is re-checked at import time, not trusted from enqueue: a
  // subject can be renamed or removed between the two, and this row's path is
  // about to be written to.
  const destinationError = await validateDestination(collectionKey, item.destinationPath);
  if (destinationError) throw new Error(destinationError);

  /**
   * Refuse an oversize file BEFORE fetching it, when Drive told us the size.
   *
   * `readCapped` stops the stream at the ceiling, so nothing could overrun — but
   * stopping there means 50 MB has already crossed the wire to learn something
   * the metadata said up front. Measured on a 71.9 MB PDF: 8.9 seconds and 50 MB
   * spent to reach a verdict that was available for free, and the claim function
   * will hand the row back twice more before giving up.
   *
   * `sizeBytes` is 0 when it is genuinely unknown — Google-native exports report
   * no size, and the keyless path has no metadata at all — so this only fires on
   * a size Drive actually stated, and `readCapped` still backs it up.
   */
  if (item.sizeBytes > 0) {
    const knownSizeError = teacherUploadSizeError(item.sizeBytes);
    if (knownSizeError) throw new Error(knownSizeError);
  }

  const entry: DriveEntry = {
    id: item.driveFileId,
    name: item.fileName,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    isFolder: false,
  };
  const download = await downloadDriveFile(entry);
  const fileName = safeFilename(download.fileName || entry.name);
  const shelf = teacherUploadShelf(item.destinationPath);
  if (!isTeacherUploadFileSupported(fileName, shelf)) {
    throw new Error(`${shelf} cannot read "${fileName}". Convert it to PDF first.`);
  }
  const sizeError = teacherUploadSizeError(download.buffer.length);
  if (sizeError) throw new Error(sizeError);

  const result = await uploadAndIndex({
    collectionKey,
    fileBuffer: download.buffer,
    fileName,
    mimeType: download.mimeType,
    path: item.destinationPath,
  });

  let warning = "";
  try {
    await savePreviewFromBuffer({
      teacherId,
      fileBuffer: download.buffer,
      fileName,
      mimeType: download.mimeType,
      collectionPath: result.collectionPath,
      documentId: indexedDocumentId(result.index),
    });
  } catch {
    warning =
      "The document was indexed, but its private preview could not be saved. Check the latest database migration.";
  }

  return {
    documentId: indexedDocumentId(result.index),
    jobId: jobId(result.index),
    fileName,
    warning,
  };
}

/**
 * Work the queue down. Every failure is written to its own row and the drain
 * continues: one unreadable document must not cost the creator the nineteen
 * behind it, which is the same rule the old one-request-per-file loop kept.
 */
export async function drainDriveQueue(collectionKey: string, teacherId: string) {
  const deadline = Date.now() + DRAIN_BUDGET_MS;
  let imported = 0;
  let failed = 0;

  while (Date.now() < deadline) {
    const item = await claimNextDriveImport(teacherId);
    if (!item) break;
    try {
      const outcome = await importOne(collectionKey, teacherId, item);
      await completeDriveImport(item.id, outcome);
      imported += 1;
    } catch (cause) {
      const message =
        cause instanceof DriveLinkError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : "This file could not be imported from Drive.";
      await failDriveImport(item.id, message);
      failed += 1;
    }
  }
  return { imported, failed };
}
