import { usageCommunityHeader } from "@/lib/usage-community-context";
import { randomUUID } from "node:crypto";
import { collectionKeyForTeacher } from "@/lib/data/challenge-collection-key";
import { getTenantApiEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { indexTeacherDocument, getTeacherPracticeTopics } from "@/lib/teacher-app/client";
import {
  indexedDocumentId,
  jobId,
  safeFilename,
  savePreview,
  sendTenantRequest,
  uploadAndIndex,
} from "@/lib/teacher-document-import";
import {
  TEACHER_UPLOAD_MAX_BYTES,
  TEACHER_UPLOAD_MAX_LABEL,
  teacherUploadSizeError,
  teacherUploadStorageFileName,
} from "@/lib/teacher-upload";
import type { StudentCourseSubjectAccess } from "@/lib/student-courses";

/**
 * A PDF a student adds to a subject's Learning Resources.
 *
 * TRIAGED BEFORE IT IS INDEXED. The backend reads three pages — 20%, 50% and 80%
 * of the way through — against the subject's micro-topics
 * (`rag_service/contribution_triage.py`). Accepted: it is indexed into the
 * creator's collection and listed for the whole community, exactly as a creator
 * upload is. Rejected: the staged copy is deleted and nothing is indexed.
 *
 * Accepted files sit in `<subject>/Notes/Community Contributed/`: inside the
 * creator's own Notes shelf, so their workspace shows them where it shows every
 * other file, and in a folder the backend always classifies as notes — a
 * student's "syllabus.pdf" must never be read as the subject's syllabus.
 */

export const CONTRIBUTED_FOLDER = "Community Contributed";
const STAGING_BUCKET = "teacher-documents";

export class ContributionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ContributionError";
  }
}

export type ContributionVerdict = {
  status: "accepted" | "rejected";
  jobId?: string;
  reason: string;
  matchedTopics: string[];
  pagesChecked: number[];
  pageCount: number;
  /** The Learning Resources row, so the list is patched rather than refetched. */
  material?: {
    name: string;
    shelf: string;
    path: string;
    indexed: boolean;
    documentId: string;
    sizeBytes: number;
    mimeType: string;
    previewAvailable: boolean;
    addedAt: string;
  };
};

function stagingPrefix(access: StudentCourseSubjectAccess, userId: string) {
  return `${access.teacherId}/contributions/${userId}/`;
}

function contributedFolder(access: StudentCourseSubjectAccess) {
  return `${access.folderPath.replace(/^\/+|\/+$/g, "")}/Notes/${CONTRIBUTED_FOLDER}`;
}

export function isPdfName(name: string) {
  return /\.pdf$/i.test(name.trim());
}

/** A signed URL the browser uploads the PDF to directly: a scan is far past
 *  what a serverless request body may carry. */
export async function prepareContribution(
  userId: string,
  access: StudentCourseSubjectAccess,
  fileName: string,
  sizeBytes: number,
) {
  const name = safeFilename(fileName.trim());
  if (!isPdfName(name)) throw new ContributionError("Only PDF files can be contributed.", 400);
  if (!(sizeBytes > 0)) throw new ContributionError("Choose a non-empty PDF.", 400);
  const sizeError = teacherUploadSizeError(sizeBytes);
  if (sizeError) throw new ContributionError(sizeError, 413);
  const storagePath = `${stagingPrefix(access, userId)}${randomUUID()}-${teacherUploadStorageFileName(name)}`;
  const { data, error } = await createSupabaseAdminClient()
    .storage.from(STAGING_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (error || !data?.token) throw new Error(error?.message || "Could not prepare the upload.");
  const { error: queueError } = await createSupabaseAdminClient()
    .from("material_contribution_jobs")
    .insert({
      user_id: userId,
      teacher_id: access.teacherId,
      course_id: access.courseId,
      subject: access.subjectSlug,
      file_name: name,
      storage_path: storagePath,
      status: "uploading",
    });
  if (queueError) throw queueError;
  return {
    bucket: STAGING_BUCKET,
    storagePath,
    token: data.token,
    uploadUrl: data.signedUrl,
    maxBytes: TEACHER_UPLOAD_MAX_BYTES,
    maxLabel: TEACHER_UPLOAD_MAX_LABEL,
  };
}

/** Unit titles and their bullets: what "belongs to this subject" is checked against. */
async function microTopics(collectionKey: string, subjectSlug: string) {
  try {
    const reply = await getTeacherPracticeTopics(collectionKey, subjectSlug);
    const topics = Array.isArray(reply.topics) ? (reply.topics as Record<string, unknown>[]) : [];
    const titles: string[] = [];
    for (const topic of topics) {
      const title = String(topic.title || "").trim();
      if (title) titles.push(title);
      const bullets = Array.isArray(topic.sub_topics)
        ? (topic.sub_topics as Record<string, unknown>[])
        : [];
      for (const bullet of bullets) {
        const text = String(bullet.text || "").trim();
        if (text) titles.push(text);
      }
    }
    return [...new Set(titles)];
  } catch {
    // No catalogue yet: the subject's name alone still tells a circuit-theory
    // scan from a chemistry one.
    return [];
  }
}

async function triage(
  collectionKey: string,
  subject: string,
  topics: string[],
  fileName: string,
  buffer: Buffer,
) {
  const { baseUrl, rejectUnauthorized } = getTenantApiEnv();
  const boundary = `----NanoTriage${randomUUID()}`;
  const field = (name: string, value: string) =>
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    );
  const body = Buffer.concat([
    field("subject", subject),
    field("topics", JSON.stringify(topics)),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${teacherUploadStorageFileName(fileName)}"\r\nContent-Type: application/pdf\r\n\r\n`,
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return sendTenantRequest(
    new URL("/v1/collection/triage-contribution", baseUrl),
    rejectUnauthorized,
    120_000,
    {
      Authorization: `Bearer ${collectionKey}`,
      ...usageCommunityHeader(),
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": body.length,
    },
    body,
  );
}

/** "Notes.pdf" → "Notes (2).pdf" while the folder already has one: a second
 *  student's file of the same name must not replace the first. */
async function freeName(teacherId: string, folder: string, name: string) {
  const { data } = await createSupabaseAdminClient()
    .from("teacher_document_files")
    .select("collection_path")
    .eq("teacher_id", teacherId)
    .ilike("collection_path", `${folder}/%`);
  const taken = new Set(
    (data ?? []).map(
      (row) =>
        String(row.collection_path || "")
          .split("/")
          .pop()
          ?.toLowerCase() ?? "",
    ),
  );
  const stem = name.replace(/\.pdf$/i, "");
  let candidate = name;
  for (let n = 2; taken.has(teacherUploadStorageFileName(candidate).toLowerCase()); n += 1) {
    candidate = `${stem} (${n}).pdf`;
  }
  return candidate;
}

export async function processContribution(
  userId: string,
  access: StudentCourseSubjectAccess,
  input: {
    storagePath: string;
    fileName: string;
    verdict?: Record<string, unknown> | null;
    collectionPath?: string;
    onTriaged?: (verdict: Record<string, unknown>) => Promise<void>;
    onUploaded?: (path: string) => Promise<void>;
  },
): Promise<ContributionVerdict> {
  const admin = createSupabaseAdminClient();
  const name = safeFilename(input.fileName.trim());
  if (!input.storagePath.startsWith(stagingPrefix(access, userId)) || !isPdfName(name)) {
    throw new ContributionError("Invalid upload.", 400);
  }
  const discard = () =>
    admin.storage
      .from(STAGING_BUCKET)
      .remove([input.storagePath])
      .then(
        () => undefined,
        () => undefined,
      );

  const download = await admin.storage.from(STAGING_BUCKET).download(input.storagePath);
  if (download.error || !download.data) {
    throw new ContributionError("The uploaded file could not be read. Upload it again.", 400);
  }
  const buffer = Buffer.from(await download.data.arrayBuffer());
  const sizeError = teacherUploadSizeError(buffer.length);
  if (sizeError) {
    await discard();
    throw new ContributionError(sizeError, 413);
  }

  const collectionKey = await collectionKeyForTeacher(access.teacherId);
  if (!collectionKey) {
    throw new ContributionError("This subject's library isn't ready for uploads yet.", 409);
  }
  // THE SLUG, as every other upstream call: display names drift.
  const subjectSlug = access.subjectSlug || access.subjectName;
  const topics = await microTopics(collectionKey, subjectSlug);

  let verdict: Record<string, unknown>;
  try {
    verdict =
      input.verdict ??
      (await triage(collectionKey, access.subjectName || subjectSlug, topics, name, buffer));
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 422 && error instanceof Error) throw new ContributionError(error.message, 422);
    throw new ContributionError("The file couldn't be checked right now. Try again shortly.", 502);
  }

  const summary = {
    reason: String(verdict.reason || ""),
    matchedTopics: Array.isArray(verdict.matched_topics) ? verdict.matched_topics.map(String) : [],
    pagesChecked: Array.isArray(verdict.pages_checked) ? verdict.pages_checked.map(Number) : [],
    pageCount: Number(verdict.page_count || 0),
  };
  if (verdict.status === "error") {
    throw new ContributionError(summary.reason || "The file couldn't be checked right now.", 502);
  }
  if (verdict.status !== "accepted") {
    await discard();
    return { status: "rejected", ...summary };
  }

  await input.onTriaged?.(verdict);
  const folder = contributedFolder(access);
  const finalName =
    input.collectionPath?.split("/").pop() || (await freeName(access.teacherId, folder, name));
  try {
    const result = input.collectionPath
      ? {
          collectionPath: input.collectionPath,
          index: await indexTeacherDocument(collectionKey, { path: input.collectionPath }),
        }
      : await uploadAndIndex({
          collectionKey,
          fileBuffer: buffer,
          fileName: finalName,
          mimeType: "application/pdf",
          path: folder,
          onUploaded: async (path) => {
            await input.onUploaded?.(path);
            await savePreview({
              teacherId: access.teacherId,
              storagePath: input.storagePath,
              collectionPath: path,
              fileName: finalName,
              mimeType: "application/pdf",
              sizeBytes: buffer.length,
              documentId: "",
            });
          },
          metadata: JSON.stringify({
            contributed_by: userId,
            community_id: access.community?.id ?? null,
            triage_pages: summary.pagesChecked,
          }),
        });
    const documentId = indexedDocumentId(result.index);
    // The staged copy becomes the preview copy: the same bytes, already stored.
    await savePreview({
      teacherId: access.teacherId,
      storagePath: input.storagePath,
      collectionPath: result.collectionPath,
      fileName: finalName,
      mimeType: "application/pdf",
      sizeBytes: buffer.length,
      documentId,
    });
    // The list opens a file by its row id, which the upsert does not return.
    const { data: row } = await admin
      .from("teacher_document_files")
      .select("id")
      .eq("teacher_id", access.teacherId)
      .eq("collection_path", result.collectionPath)
      .maybeSingle();
    return {
      status: "accepted",
      jobId: jobId(result.index),
      ...summary,
      material: {
        name: finalName,
        shelf: "Notes",
        path: result.collectionPath,
        indexed: false,
        documentId: String(row?.id || ""),
        sizeBytes: buffer.length,
        mimeType: "application/pdf",
        previewAvailable: Boolean(row?.id),
        addedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    // An outage changes the attempt, never ownership of the saved source.
    throw error;
  }
}
