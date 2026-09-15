import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { TeacherApiError } from "@/lib/teacher-app/client";
import {
  isTeacherUploadFileSupported,
  TEACHER_UPLOAD_MAX_BYTES,
  TEACHER_UPLOAD_MAX_LABEL,
  teacherUploadShelf,
  teacherUploadSizeError,
  teacherUploadStorageFileName,
} from "@/lib/teacher-upload";
import {
  indexedDocumentId,
  jobId,
  numberValue,
  safeFilename,
  savePreview,
  savePreviewFromBuffer,
  text,
  UpstreamUploadError,
  uploadAndIndex,
  validateDestination,
} from "@/lib/teacher-document-import";
import {
  downloadDriveFile,
  driveContentType,
  driveFileName,
  driveFolderSupportEnabled,
  DriveLinkError,
  resolveDriveLink,
  type DriveEntry,
} from "@/lib/google-drive";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enqueueDriveImports } from "@/lib/data/teacher-drive-queue";
import { drainDriveQueue } from "@/lib/teacher-drive-drain";

type ApiRecord = Record<string, unknown>;

export const maxDuration = 300;

function field(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function driveErrorStatus(error: DriveLinkError) {
  switch (error.kind) {
    case "invalid":
    case "unsupported":
      return 400;
    // Not 403: nothing about THIS app refused the request. The file is private,
    // which is the creator's own setting and the message says how to change it.
    case "sharing":
      return 409;
    case "not-found":
      return 404;
    case "too-large":
      return 413;
    default:
      return 502;
  }
}

function errorResponse(error: unknown) {
  if (error instanceof DriveLinkError) {
    return NextResponse.json(
      { error: error.message, code: error.kind },
      {
        status: driveErrorStatus(error),
      },
    );
  }

  console.error("Upload route error:", error);
  const status =
    error instanceof UpstreamUploadError
      ? error.status === 413
        ? 413
        : error.status >= 400 && error.status < 500
          ? error.status
          : 502
      : error instanceof TeacherApiError
        ? error.status
        : 500;
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "The upload could not be completed." },
    { status },
  );
}

export async function POST(request: Request) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const input = (await request.json().catch(() => null)) as ApiRecord | null;
      const action = text(input?.action);
      const path = text(input?.path);
      const destinationError = await validateDestination(teacher.collection_sk, path);
      if (destinationError) {
        return NextResponse.json({ error: destinationError }, { status: 400 });
      }

      if (action === "prepare") {
        const fileName = safeFilename(text(input?.fileName));
        const sizeBytes = numberValue(input?.sizeBytes);
        if (!fileName || sizeBytes <= 0) {
          return NextResponse.json({ error: "Choose a non-empty file first." }, { status: 400 });
        }
        const sizeError = teacherUploadSizeError(sizeBytes);
        if (sizeError) return NextResponse.json({ error: sizeError }, { status: 413 });
        const storagePath = `${teacher.id}/staged/${randomUUID()}-${teacherUploadStorageFileName(fileName)}`;
        const admin = createSupabaseAdminClient();
        const { data, error } = await admin.storage
          .from("teacher-documents")
          .createSignedUploadUrl(storagePath);
        if (error || !data?.token) {
          throw new Error(error?.message || "Could not prepare private upload storage.");
        }
        return NextResponse.json({
          bucket: "teacher-documents",
          storagePath,
          token: data.token,
          maxBytes: TEACHER_UPLOAD_MAX_BYTES,
          maxLabel: TEACHER_UPLOAD_MAX_LABEL,
        });
      }

      if (action === "complete") {
        const storagePath = text(input?.storagePath);
        const fileName = safeFilename(text(input?.fileName));
        const mimeType = text(input?.mimeType) || "application/octet-stream";
        if (!storagePath.startsWith(`${teacher.id}/staged/`) || !fileName) {
          return NextResponse.json({ error: "Invalid staged upload." }, { status: 400 });
        }
        const admin = createSupabaseAdminClient();
        const { data, error } = await admin.storage.from("teacher-documents").download(storagePath);
        if (error || !data) {
          return NextResponse.json(
            { error: error?.message || "The staged file could not be read." },
            { status: 400 },
          );
        }
        const fileBuffer = Buffer.from(await data.arrayBuffer());
        const sizeError = teacherUploadSizeError(fileBuffer.length);
        if (sizeError) {
          await admin.storage.from("teacher-documents").remove([storagePath]);
          return NextResponse.json({ error: sizeError }, { status: 413 });
        }
        try {
          const result = await uploadAndIndex({
            collectionKey: teacher.collection_sk,
            fileBuffer,
            fileName,
            mimeType,
            path,
            metadata: text(input?.metadata),
          });
          await savePreview({
            teacherId: teacher.id,
            storagePath,
            collectionPath: result.collectionPath,
            fileName,
            mimeType,
            sizeBytes: fileBuffer.length,
            documentId: indexedDocumentId(result.index),
          });
          return NextResponse.json({
            upload: result.upload,
            index: result.index,
            jobId: jobId(result.index),
            previewWarning: "",
          });
        } catch (error) {
          await admin.storage.from("teacher-documents").remove([storagePath]);
          throw error;
        }
      }

      /**
       * Step one of a link import: what does this link actually point at?
       *
       * Kept apart from the import itself so the creator SEES the file list
       * before anything is fetched — a folder link can name twenty documents,
       * and importing them on a paste, with no confirmation, is not the same
       * gesture as choosing files from a picker. It also means the sharing
       * error arrives immediately rather than after a partial import.
       */
      if (action === "drive-resolve") {
        const shelf = teacherUploadShelf(path);
        const entries = await resolveDriveLink(text(input?.link));
        const files = entries.map((entry) => {
          const name = driveFileName(entry);
          return {
            id: entry.id,
            name,
            mimeType: entry.mimeType,
            contentType: driveContentType(entry),
            sizeBytes: entry.sizeBytes,
            // A name is only absent on the keyless path, where nothing is known
            // until the bytes arrive — so it cannot be pre-judged unsupported.
            supported: !name || isTeacherUploadFileSupported(name, shelf),
            tooLarge: Boolean(entry.sizeBytes) && entry.sizeBytes > TEACHER_UPLOAD_MAX_BYTES,
          };
        });
        return NextResponse.json({
          files,
          shelf,
          folderSupport: driveFolderSupportEnabled(),
          maxBytes: TEACHER_UPLOAD_MAX_BYTES,
          maxLabel: TEACHER_UPLOAD_MAX_LABEL,
        });
      }

      /**
       * Step two: hand the files to the queue and return.
       *
       * This used to be one request per file, each fetching the bytes from Drive
       * and then waiting out a synchronous PDF/OCR index on the tenant side — so
       * a twenty-file folder was twenty serial requests behind a dialog the
       * creator could not close. Closing it, or a dropped connection, lost every
       * file the loop had not reached.
       *
       * Now the browser writes down what it wants and leaves. The rows are
       * durable (`teacher_drive_imports`), a drain worker does the importing,
       * and the outcome of each file is read back from the queue — which means
       * it survives a reload, a redeploy, and a different device.
       *
       * The ids come back from `drive-resolve`; they are not trusted for
       * anything beyond naming a public Drive file, which anyone could fetch
       * anyway. The destination IS checked, here on `validateDestination` like
       * every other branch, and again by the worker before it writes.
       */
      if (action === "drive-enqueue") {
        const requested = Array.isArray(input?.files) ? input.files : [];
        const items = requested.flatMap((entry) => {
          if (!entry || typeof entry !== "object") return [];
          const record = entry as ApiRecord;
          const fileId = text(record.fileId);
          if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) return [];
          return [
            {
              driveFileId: fileId,
              fileName: safeFilename(text(record.fileName)),
              mimeType: text(record.mimeType),
              sizeBytes: numberValue(record.sizeBytes),
              destinationPath: path,
              shelf: teacherUploadShelf(path),
              sourceLink: text(input?.link),
            },
          ];
        });
        if (!items.length) {
          return NextResponse.json(
            { error: "No importable Drive file was given." },
            {
              status: 400,
            },
          );
        }

        const { queued, unavailable } = await enqueueDriveImports(teacher.id, items);
        if (unavailable) {
          return NextResponse.json(
            {
              error:
                "The Drive import queue is not available on this deployment. Run the latest database migration.",
            },
            { status: 503 },
          );
        }

        /**
         * Start a drain and DO NOT await it.
         *
         * The response is the point of this branch: the creator is told their
         * files are queued and the dialog closes. Awaiting the drain here would
         * reintroduce exactly the wait this change exists to remove.
         *
         * Nothing is lost if the drain never starts or dies early — the rows are
         * already durable, and the dialog's own polling starts another one
         * whenever it sees pending work. That is why the rejection is swallowed
         * rather than reported: there is no failure here to report.
         */
        void drainDriveQueue(teacher.collection_sk, teacher.id).catch((cause) => {
          console.error("Drive queue drain (background) error:", cause);
        });

        return NextResponse.json({ queued, queuedCount: queued.length });
      }

      /**
       * Step two: one file, fetched and then walked down exactly the path a
       * local upload takes — `uploadAndIndex`, then the private preview copy.
       *
       * One file per request rather than the whole folder in one, so the dialog
       * can report progress and a single unreadable document does not cost the
       * creator the nineteen that would have imported. The id comes back from
       * `drive-resolve`; it is not trusted for anything beyond naming a public
       * Drive file, which is a thing anyone could fetch anyway. What IS checked
       * is the destination, on the same `validateDestination` every other
       * branch here uses.
       */
      if (action === "drive-import") {
        const fileId = text(input?.fileId);
        if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) {
          return NextResponse.json({ error: "Invalid Drive file." }, { status: 400 });
        }
        const entry: DriveEntry = {
          id: fileId,
          name: safeFilename(text(input?.fileName)),
          mimeType: text(input?.mimeType),
          sizeBytes: numberValue(input?.sizeBytes),
          isFolder: false,
        };
        const download = await downloadDriveFile(entry);
        const fileName = safeFilename(download.fileName || entry.name);
        const shelf = teacherUploadShelf(path);
        if (!isTeacherUploadFileSupported(fileName, shelf)) {
          return NextResponse.json(
            { error: `${shelf} cannot read "${fileName}". Convert it to PDF first.` },
            { status: 400 },
          );
        }
        const sizeError = teacherUploadSizeError(download.buffer.length);
        if (sizeError) return NextResponse.json({ error: sizeError }, { status: 413 });

        const result = await uploadAndIndex({
          collectionKey: teacher.collection_sk,
          fileBuffer: download.buffer,
          fileName,
          mimeType: download.mimeType,
          path,
          metadata: text(input?.metadata),
        });
        let previewWarning = "";
        try {
          await savePreviewFromBuffer({
            teacherId: teacher.id,
            fileBuffer: download.buffer,
            fileName,
            mimeType: download.mimeType,
            collectionPath: result.collectionPath,
            documentId: indexedDocumentId(result.index),
          });
        } catch {
          previewWarning =
            "The document was indexed, but its private preview could not be saved. Check the latest database migration.";
        }
        return NextResponse.json({
          upload: result.upload,
          index: result.index,
          jobId: jobId(result.index),
          fileName,
          previewWarning,
        });
      }

      return NextResponse.json({ error: "Unknown upload action." }, { status: 400 });
    }

    // Small-file backwards-compatible path. The UI uses signed storage so large files
    // never pass through the deployment request-body limit.
    const formData = await request.formData();
    const file = formData.get("file");
    const path = field(formData.get("path"));
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    const sizeError = teacherUploadSizeError(file.size);
    if (sizeError) return NextResponse.json({ error: sizeError }, { status: 413 });
    const destinationError = await validateDestination(teacher.collection_sk, path);
    if (destinationError) {
      return NextResponse.json({ error: destinationError }, { status: 400 });
    }
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadAndIndex({
      collectionKey: teacher.collection_sk,
      fileBuffer,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      path,
      metadata: field(formData.get("metadata")),
    });
    let previewWarning = "";
    try {
      await savePreviewFromBuffer({
        teacherId: teacher.id,
        fileBuffer,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        collectionPath: result.collectionPath,
        documentId: indexedDocumentId(result.index),
      });
    } catch {
      previewWarning =
        "The document was indexed, but its private preview could not be saved. Check the latest database migration.";
    }
    return NextResponse.json({
      upload: result.upload,
      index: result.index,
      jobId: jobId(result.index),
      previewWarning,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
