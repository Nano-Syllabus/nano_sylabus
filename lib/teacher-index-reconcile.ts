import {
  listDriveImports,
  updateDriveIndexState,
  type DriveImportItem,
} from "@/lib/data/teacher-drive-queue";
import {
  getTeacherJob,
  getTeacherDocuments,
  invalidateTeacherReads,
  TeacherApiError,
} from "@/lib/teacher-app/client";

/** Only searchable chunks prove completion. A successful enqueue is still pending. */
export function indexingOutcome(job: Record<string, unknown>) {
  const status = String(job.status || job.stage || "");
  if (["indexed", "done"].includes(status) && Number(job.chunks_indexed) > 0) return "done";
  if (["failed", "cancelled", "expired"].includes(status))
    return status === "expired" ? "expired" : "failed";
  if (["indexed", "done"].includes(status)) return "failed";
  return "indexing";
}

export async function reconcileDriveIndexes(collectionKey: string, teacherId: string) {
  const { items } = await listDriveImports(teacherId, 200);
  const pending = items.filter((item) => item.status === "indexing");
  let documents: Promise<Record<string, unknown>[]> | undefined;
  async function reconcile(item: DriveImportItem) {
    try {
      const job = await getTeacherJob(collectionKey, item.jobId);
      const status = indexingOutcome(job);
      // Finished: the collection's cached documents/readiness are out of date.
      if (status !== "indexing") invalidateTeacherReads(collectionKey);
      await updateDriveIndexState(item, {
        status,
        indexing_started_at:
          Number(job.started_at) > 0 ? new Date(Number(job.started_at) * 1000).toISOString() : null,
        warning: status === "indexing" ? String(job.detail || "Queued for indexing") : "",
        error:
          status === "failed"
            ? String(
                job.detail ||
                  "No searchable chunks were produced. The file is saved; retry indexing.",
              )
            : "",
        ...(status !== "indexing" ? { finished_at: new Date().toISOString() } : {}),
      });
    } catch (error) {
      if (!(error instanceof TeacherApiError) || error.status !== 404) return; // transient outage: keep the job, expire at 24h
      // An older server may have forgotten the job. Check its actual document before retrying.
      // Proof of indexing must be a live read, not this server's cached copy.
      if (!documents) invalidateTeacherReads(collectionKey);
      documents ??= getTeacherDocuments(collectionKey).then(
        (reply) =>
          (Array.isArray(reply)
            ? reply
            : Array.isArray(reply.documents)
              ? reply.documents
              : []) as Record<string, unknown>[],
      );
      const found = (await documents).find(
        (doc) =>
          (item.collectionPath && doc.path === item.collectionPath) ||
          (item.documentId && doc.document_id === item.documentId),
      );
      const done = Number(found?.chunk_count) > 0;
      await updateDriveIndexState(item, {
        status: done ? "done" : "retry_wait",
        next_attempt_at: new Date(Date.now() + 30_000).toISOString(),
        error: done ? "" : "Indexing was interrupted. Retrying the saved file.",
        ...(done ? { finished_at: new Date().toISOString() } : {}),
      });
    }
  }
  // Bound upstream reads too: no burst of hundreds of requests after an outage.
  for (let i = 0; i < pending.length; i += 3) {
    await Promise.all(pending.slice(i, i + 3).map(reconcile));
  }
}
