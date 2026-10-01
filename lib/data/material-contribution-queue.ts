import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getStudentCourseSubjectAccessCached,
  type StudentCourseSubjectAccess,
} from "@/lib/student-courses";
import {
  ContributionError,
  isPdfName,
  processContribution,
} from "@/lib/data/material-contributions";
import { collectionKeyForTeacher } from "@/lib/data/challenge-collection-key";
import { getTeacherJob, TeacherApiError } from "@/lib/teacher-app/client";
import { indexingOutcome } from "@/lib/teacher-index-reconcile";

const table = "material_contribution_jobs";
const active = ["uploading", "queued", "checking", "retry_wait", "indexing"];

export async function completeContribution(
  userId: string,
  access: StudentCourseSubjectAccess,
  input: { storagePath: string; fileName: string },
) {
  const prefix = `${access.teacherId}/contributions/${userId}/`;
  if (
    !input.storagePath.startsWith(prefix) ||
    input.storagePath.includes("..") ||
    !isPdfName(input.fileName)
  )
    throw new ContributionError("Invalid upload.", 400);
  const admin = createSupabaseAdminClient();
  const { data: existing, error: readError } = await admin
    .from(table)
    .select("id,status,result")
    .eq("storage_path", input.storagePath)
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw readError;
  if (existing && ["accepted", "rejected"].includes(existing.status)) return existing.result;
  if (existing && ["uploading", "failed", "expired"].includes(existing.status)) {
    const now = new Date().toISOString();
    const { error } = await admin
      .from(table)
      .update({
        status: "queued",
        error: "",
        attempts: 0,
        queued_at: now,
        next_attempt_at: now,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        finished_at: null,
      })
      .eq("id", existing.id)
      .in("status", ["uploading", "failed", "expired"]);
    if (error) throw error;
  } else if (!existing) {
    const { error } = await admin
      .from(table)
      .insert({
        user_id: userId,
        teacher_id: access.teacherId,
        course_id: access.courseId,
        subject: access.subjectSlug,
        file_name: input.fileName,
        storage_path: input.storagePath,
      });
    if (error && error.code !== "23505") throw error;
  }
  return {
    status: "queued",
    reason:
      "Your file is saved. We will check it and index it in the background. You can close this dialog.",
    matchedTopics: [],
    pagesChecked: [],
    pageCount: 0,
  };
}

export async function listPendingContributions(userId: string, access: StudentCourseSubjectAccess) {
  const { data, error } = await createSupabaseAdminClient()
    .from(table)
    .select("file_name,storage_path,status,error,queued_at,started_at,expires_at")
    .eq("user_id", userId)
    .eq("teacher_id", access.teacherId)
    .eq("subject", access.subjectSlug)
    .in("status", [...active, "failed", "expired"])
    .order("queued_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    name: row.file_name,
    storagePath: row.storage_path,
    status: row.status,
    error: row.error,
    queuedAt: row.queued_at,
    startedAt: row.started_at,
  }));
}

/** A worker may finish late, but it cannot replace a newer claim's state. */
export async function drainContributions(userId?: string) {
  const admin = createSupabaseAdminClient();
  const deadline = Date.now() + 220_000;
  // Recover an uploaded object even if the browser closed before calling complete.
  let staged = admin
    .from(table)
    .select("id,storage_path")
    .eq("status", "uploading")
    .gt("expires_at", new Date().toISOString())
    .limit(50);
  if (userId) staged = staged.eq("user_id", userId);
  const { data: waiting, error: stagingError } = await staged;
  if (stagingError) throw stagingError;
  for (const row of waiting ?? []) {
    const { data: object, error } = await admin.storage
      .from("teacher-documents")
      .info(row.storage_path);
    if (!error && object) {
      const { error: updateError } = await admin
        .from(table)
        .update({ status: "queued", next_attempt_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "uploading");
      if (updateError) throw updateError;
    }
  }
  async function worker() {
    while (Date.now() < deadline) {
      const { data, error } = await admin.rpc("claim_material_contribution", {
        target_user_id: userId ?? null,
      });
      if (error) throw error;
      const row = data?.[0];
      if (!row) return;
      const update = async (patch: Record<string, unknown>) => {
        const { data: changed, error } = await admin
          .from(table)
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("id", row.id)
          .eq("status", "checking")
          .eq("attempts", row.attempts)
          .eq("started_at", row.started_at)
          .select("id");
        if (error) throw error;
        if (!changed?.length) throw new Error("Contribution lease expired; file retained.");
      };
      try {
        const access = await getStudentCourseSubjectAccessCached(
          row.user_id,
          row.course_id,
          row.subject,
        );
        if (!access || access.teacherId !== row.teacher_id)
          throw new ContributionError(
            "Access to this subject has changed. Your file is retained.",
            403,
          );
        const result = await processContribution(row.user_id, access, {
          storagePath: row.storage_path,
          fileName: row.file_name,
          verdict: row.verdict,
          collectionPath: row.collection_path,
          onTriaged: (verdict) => update({ verdict }),
          onUploaded: (path) => update({ collection_path: path }),
        });
        await update({
          status: result.status === "accepted" && result.jobId ? "indexing" : result.status,
          result,
          error: "",
          ...(result.status === "rejected" ? { finished_at: new Date().toISOString() } : {}),
        });
      } catch (cause) {
        const status = (cause as { status?: number })?.status;
        const retryable = !status || [408, 409, 429, 500, 502, 503, 504].includes(status);
        await update({
          status: retryable ? "retry_wait" : "failed",
          error: cause instanceof Error ? cause.message : "Check paused. File saved.",
          next_attempt_at: new Date(
            Date.now() + Math.min(900_000, 30_000 * 2 ** Math.min(row.attempts - 1, 5)),
          ).toISOString(),
        });
      }
    }
  }
  const outcomes = await Promise.allSettled([worker(), worker()]);
  const failed = outcomes.find((outcome) => outcome.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  let query = admin
    .from(table)
    .select("id,user_id,teacher_id,result")
    .eq("status", "indexing")
    .limit(100);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) throw error;
  for (const row of data ?? []) {
    try {
      const key = await collectionKeyForTeacher(row.teacher_id);
      if (!key) continue;
      const job = await getTeacherJob(key, row.result?.jobId);
      const outcome = indexingOutcome(job);
      if (outcome === "indexing") continue;
      const { error } = await admin
        .from(table)
        .update({
          status: outcome === "done" ? "accepted" : outcome,
          finished_at: new Date().toISOString(),
          error:
            outcome === "done"
              ? ""
              : String(job.detail || "Indexing did not finish; the file is saved."),
        })
        .eq("id", row.id)
        .eq("status", "indexing")
        .eq("result->>jobId", row.result?.jobId);
      if (error) throw error;
    } catch (error) {
      if (error instanceof TeacherApiError && error.status === 404) {
        const { error: updateError } = await admin
          .from(table)
          .update({
            status: "retry_wait",
            next_attempt_at: new Date(Date.now() + 30_000).toISOString(),
            error: "Indexing was interrupted. Retrying the saved file.",
          })
          .eq("id", row.id)
          .eq("status", "indexing");
        if (updateError) throw updateError;
      }
      // Provider outages leave the durable activity pending, bounded by expires_at.
    }
  }
}
