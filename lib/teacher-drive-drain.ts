import {
  claimNextDriveImport,
  checkpointDriveImport,
  completeDriveImport,
  failDriveImport,
  type DriveImportItem,
} from "@/lib/data/teacher-drive-queue";
import { indexTeacherDocument } from "@/lib/teacher-app/client";
import {
  downloadDriveFile,
  DriveLinkError,
  fetchDriveMetadata,
  type DriveEntry,
} from "@/lib/google-drive";
import {
  UpstreamUploadError,
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

async function importOne(
  collectionKey: string,
  teacherId: string,
  item: DriveImportItem,
  /** Filled in as the name becomes known, so a failure later on can still
   *  record it — otherwise a failed row keeps the "Drive file" placeholder and
   *  the creator cannot tell which document it was. */
  learned: { fileName: string },
) {
  // The destination is re-checked at import time, not trusted from enqueue: a
  // subject can be renamed or removed between the two, and this row's path is
  // about to be written to.
  const destinationError = await validateDestination(collectionKey, item.destinationPath);
  if (destinationError) throw new UpstreamUploadError(destinationError, 400);

  if (item.collectionPath) {
    const index = await indexTeacherDocument(collectionKey, { path: item.collectionPath });
    return {
      documentId: indexedDocumentId(index),
      jobId: jobId(index),
      fileName: item.fileName,
      warning: "",
    };
  }

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
  let known = { name: item.fileName, mimeType: item.mimeType, sizeBytes: item.sizeBytes };

  // ASK DRIVE OURSELVES WHEN THE ROW DOES NOT KNOW.
  //
  // The row's metadata came from the browser, which only has it when the resolve
  // that produced it ran with an API key. A deployment without one enqueues rows
  // with no name, no type and size 0 — and `sizeBytes > 0` below then reads that
  // 0 as "nothing to check" rather than "not known", so the ceiling never applies.
  // The worker is on the server and the key is here, so the honest thing is to ask
  // rather than to trust what arrived.
  if (!known.sizeBytes || !known.name) {
    try {
      const fresh = await fetchDriveMetadata(item.driveFileId);
      if (fresh) {
        known = {
          name: known.name || fresh.name,
          mimeType: known.mimeType || fresh.mimeType,
          sizeBytes: known.sizeBytes || fresh.sizeBytes,
        };
      }
    } catch (cause) {
      // A metadata call that fails is not a reason to abandon the import: the
      // download below still enforces the ceiling, and it reports sharing and
      // not-found faults with better messages than this call can.
      if (!(cause instanceof DriveLinkError)) throw cause;
    }
  }

  learned.fileName = known.name;

  if (known.sizeBytes > 0) {
    const knownSizeError = teacherUploadSizeError(known.sizeBytes);
    if (knownSizeError) throw new UpstreamUploadError(knownSizeError, 413);
  }

  const entry: DriveEntry = {
    id: item.driveFileId,
    name: known.name,
    mimeType: known.mimeType,
    sizeBytes: known.sizeBytes,
    isFolder: false,
  };
  const download = await downloadDriveFile(entry);
  const fileName = safeFilename(download.fileName || entry.name);
  learned.fileName = fileName;
  const shelf = teacherUploadShelf(item.destinationPath);
  if (!isTeacherUploadFileSupported(fileName, shelf)) {
    throw new UpstreamUploadError(
      `${shelf} cannot read "${fileName}". Convert it to PDF first.`,
      400,
    );
  }
  const sizeError = teacherUploadSizeError(download.buffer.length);
  if (sizeError) throw new UpstreamUploadError(sizeError, 413);

  let warning = "";
  const result = await uploadAndIndex({
    collectionKey,
    fileBuffer: download.buffer,
    fileName,
    mimeType: download.mimeType,
    path: item.destinationPath,
    onUploaded: async (collectionPath) => {
      await checkpointDriveImport(item, collectionPath);
      try {
        await savePreviewFromBuffer({
          teacherId,
          fileBuffer: download.buffer,
          fileName,
          mimeType: download.mimeType,
          collectionPath,
          documentId: "",
        });
      } catch {
        warning = "Original file saved in the collection; private preview is unavailable.";
      }
    },
  });

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

  async function worker() {
    while (Date.now() < deadline) {
      const item = await claimNextDriveImport(teacherId);
      if (!item) break;
      const learned = { fileName: item.fileName };
      try {
        const outcome = await importOne(collectionKey, teacherId, item, learned);
        await completeDriveImport(item.id, outcome, item.attempts, item.claimedAt);
        imported += 1;
      } catch (cause) {
        const message =
          cause instanceof DriveLinkError
            ? cause.message
            : cause instanceof Error
              ? cause.message
              : "This file could not be imported from Drive.";
        const status = (cause as { status?: number })?.status;
        const retryable = !status || [408, 429, 500, 502, 503, 504].includes(status);
        await failDriveImport(
          item.id,
          message,
          learned.fileName,
          item.attempts,
          retryable,
          item.claimedAt,
        );
        failed += 1;
      }
    }
  }
  const results = await Promise.allSettled(Array.from({ length: 3 }, () => worker()));
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  return { imported, failed };
}
