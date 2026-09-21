import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import {
  deleteTeacherDocument,
  getTeacherDocument,
  indexTeacherDocument,
  renameTeacherDocument,
  TeacherApiError,
} from "@/lib/teacher-app/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { safeUploadPath } from "@/lib/teacher-document-import";
import { cleanDocumentName } from "@/lib/teacher-document-name";

type RouteContext = { params: Promise<{ documentId: string }> };
type ApiRecord = Record<string, unknown>;

function resultJobId(result: ApiRecord) {
  if (typeof result.job_id === "string") return result.job_id;
  if (result.job && typeof result.job === "object") {
    const job = result.job as ApiRecord;
    if (typeof job.job_id === "string") return job.job_id;
    if (typeof job.id === "string") return job.id;
  }
  return typeof result.id === "string" ? result.id : "";
}

async function teacherAndDocumentId(context: RouteContext) {
  const teacher = await getTeacherProfile();
  const { documentId } = await context.params;
  const id = documentId.trim();
  return { teacher, id: id && id.length <= 200 ? id : "" };
}

function apiFailure(error: unknown, fallback: string) {
  const apiError = error instanceof TeacherApiError ? error : null;
  const invalidKey = apiError?.status === 401;
  const notFound = apiError?.status === 404;
  return NextResponse.json(
    {
      error: invalidKey
        ? "This teacher workspace key is no longer valid."
        : notFound
          ? "Document not found in this teacher collection."
          : fallback,
    },
    { status: invalidKey ? 409 : notFound ? 404 : 502 },
  );
}

function documentPath(value: ApiRecord) {
  for (const key of ["source_path", "path", "source_file"] as const) {
    if (typeof value[key] === "string") return value[key];
  }
  return "";
}

function backendDocumentId(value: ApiRecord) {
  for (const key of ["document_id", "id"] as const) {
    if (typeof value[key] === "string") return value[key];
  }
  return "";
}

function normalizedPath(value: string) {
  return value.replace(/^\/+|\/+$/g, "");
}

function pathCandidates(path: string) {
  const clean = normalizedPath(path);
  const candidates = new Set([clean]);
  const segments = clean.split("/").filter(Boolean);
  if (segments.length > 1) candidates.add(segments.slice(1).join("/"));
  if (segments.length > 2) candidates.add(segments.slice(-3).join("/"));
  return [...candidates].filter(Boolean);
}

async function findMirror(teacherId: string, documentId: string, path: string) {
  const admin = createSupabaseAdminClient();
  const columns = "id,storage_path,original_name,mime_type,size_bytes";
  const byExternalId = await admin
    .from("teacher_document_files")
    .select(columns)
    .eq("teacher_id", teacherId)
    .eq("external_document_id", documentId)
    .maybeSingle();
  if (byExternalId.error) throw byExternalId.error;
  if (byExternalId.data) return byExternalId.data;

  for (const candidate of pathCandidates(path)) {
    const byPath = await admin
      .from("teacher_document_files")
      .select(columns)
      .eq("teacher_id", teacherId)
      .eq("collection_path", candidate)
      .maybeSingle();
    if (byPath.error) throw byPath.error;
    if (byPath.data) return byPath.data;
  }

  const byMirrorId = await admin
    .from("teacher_document_files")
    .select(columns)
    .eq("teacher_id", teacherId)
    .eq("id", documentId)
    .maybeSingle();
  if (byMirrorId.error) throw byMirrorId.error;
  return byMirrorId.data;
}

/**
 * The document as the collection index describes it — or, when it has no index
 * row, what is known about the file without one.
 *
 * A file the portal stored but never indexed is a 404 on the tenant detail
 * route, because that route reads the index. Answering the dialog with that 404
 * says "this document does not exist" about a file that is sitting on the shelf,
 * and takes the private preview and the Re-index button down with it — the two
 * things a creator opens that dialog for when a file has not indexed.
 */
async function readDocumentOrStub(collectionKey: string, id: string, hintPath: string) {
  try {
    return await getTeacherDocument(collectionKey, id);
  } catch (error) {
    const missing = error instanceof TeacherApiError && error.status === 404;
    if (!missing || !hintPath || !safeUploadPath(hintPath)) throw error;
    return {
      document_id: id,
      path: hintPath,
      name: hintPath.split("/").pop() || "file",
      status: "",
      indexed: false,
      chunk_count: 0,
      word_count: 0,
    } satisfies ApiRecord;
  }
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { teacher, id } = await teacherAndDocumentId(context);
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!id) return NextResponse.json({ error: "Invalid document." }, { status: 400 });
    const hintPath = (new URL(request.url).searchParams.get("path") || "").trim();
    const document = await readDocumentOrStub(teacher.collection_sk, id, hintPath);
    const path = documentPath(document);
    const documentId = backendDocumentId(document) || id;
    const mirror = await findMirror(teacher.id, documentId, path);
    let previewUrl = "";
    if (mirror?.storage_path) {
      const admin = createSupabaseAdminClient();
      const { data } = await admin.storage
        .from("teacher-documents")
        .createSignedUrl(mirror.storage_path, 300, { download: false });
      previewUrl = data?.signedUrl || "";
    }
    return NextResponse.json({
      document,
      file: mirror ? {
        name: mirror.original_name,
        mimeType: mirror.mime_type,
        size: mirror.size_bytes,
        previewUrl,
      } : {
        name:
          typeof document.name === "string"
            ? document.name
            : path.split("/").pop() || "file",
        mimeType:
          typeof document.mime_type === "string"
            ? document.mime_type
            : typeof document.content_type === "string"
              ? document.content_type
              : "application/pdf",
        size:
          typeof document.size_bytes === "number"
            ? document.size_bytes
            : typeof document.size === "number"
              ? document.size
              : 0,
        previewUrl: `/api/teacher/documents/${encodeURIComponent(documentId)}/raw`,
      },
    });
  } catch (error) {
    return apiFailure(error, "Could not load the document.");
  }
}

/**
 * Queue this document for indexing.
 *
 * Accepts a collection-relative `path` in the body, and prefers it.
 *
 * A file that has never been indexed has no row in the collection index, and the
 * id the source tree shows for it is derived from its path rather than stored —
 * so indexing it by that id is a 404, which is precisely the file that most
 * needs this route. The path resolves either way, and the tenant API confines it
 * to this creator's own collection before it touches anything.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { teacher, id } = await teacherAndDocumentId(context);
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!id) return NextResponse.json({ error: "Invalid document." }, { status: 400 });

    const input = (await request.json().catch(() => ({}))) as { path?: unknown };
    const path = typeof input.path === "string" ? input.path.trim() : "";
    if (path && !safeUploadPath(path)) {
      return NextResponse.json({ error: "Invalid document path." }, { status: 400 });
    }

    const result = await indexTeacherDocument(
      teacher.collection_sk,
      path ? { path } : { documentId: id },
    );
    return NextResponse.json({ result, jobId: resultJobId(result) });
  } catch (error) {
    return apiFailure(error, "Could not re-index the document.");
  }
}

/**
 * Rename this document — what it is called, never where it lives.
 *
 * The collection API records the new name beside the file, so its path, its
 * id, its chunks and the collection index stay exactly as they were and nothing
 * is re-indexed. The private preview mirror holds the name as a snapshot — it
 * is what the student library lists and what a download is saved as — so it is
 * brought along; its storage path and collection path, the two things that
 * FIND it, are not touched.
 *
 * The API is the authority on the name: it keeps the file's extension and
 * refuses a name another file in the same folder already has. The check here
 * only stops a name that could never be valid from costing a round trip.
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { teacher, id } = await teacherAndDocumentId(context);
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!id) return NextResponse.json({ error: "Invalid document." }, { status: 400 });

    const input = (await request.json().catch(() => ({}))) as { name?: unknown; path?: unknown };
    const typed = cleanDocumentName(input.name, "");
    if (typed.error !== undefined) {
      return NextResponse.json({ error: typed.error }, { status: 400 });
    }
    const path = typeof input.path === "string" ? input.path.trim() : "";
    if (path && !safeUploadPath(path)) {
      return NextResponse.json({ error: "Invalid document path." }, { status: 400 });
    }

    const result = await renameTeacherDocument(teacher.collection_sk, id, {
      name: typed.name,
      ...(path ? { path } : {}),
    });
    const name = typeof result.name === "string" ? result.name : typed.name;
    const renamedPath = typeof result.path === "string" ? result.path : path;

    // The rename has landed; a mirror that could not follow it costs the student
    // library the new label, not the creator their rename. Say so and carry on.
    let mirrorSynced = true;
    try {
      const mirror = await findMirror(teacher.id, id, renamedPath);
      if (mirror && mirror.original_name !== name) {
        const { error } = await createSupabaseAdminClient()
          .from("teacher_document_files")
          .update({ original_name: name })
          .eq("id", mirror.id)
          .eq("teacher_id", teacher.id);
        if (error) throw error;
      }
    } catch (error) {
      mirrorSynced = false;
      console.error("[PATCH /api/teacher/documents/[documentId]] preview name not updated", error);
    }

    return NextResponse.json({
      document: { id, path: renamedPath, name },
      name,
      renamed: result.renamed === true,
      mirrorSynced,
    });
  } catch (error) {
    // The API's own reasons — a name it will not take, a name already in use in
    // that folder — are the creator's to read and fix, so they pass through.
    if (error instanceof TeacherApiError && (error.status === 400 || error.status === 409)) {
      const message = error.message.trim() || "Could not rename the document.";
      return NextResponse.json(
        { error: `${message.charAt(0).toUpperCase()}${message.slice(1)}` },
        { status: error.status },
      );
    }
    return apiFailure(error, "Could not rename the document.");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { teacher, id } = await teacherAndDocumentId(context);
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!id) return NextResponse.json({ error: "Invalid document." }, { status: 400 });

    const document = await getTeacherDocument(teacher.collection_sk, id);
    await deleteTeacherDocument(teacher.collection_sk, id);
    const path = documentPath(document);
    if (path) {
      const admin = createSupabaseAdminClient();
      const { data: mirror } = await admin
        .from("teacher_document_files")
        .select("id,storage_path")
        .eq("teacher_id", teacher.id)
        .eq("collection_path", path)
        .maybeSingle();
      if (mirror) {
        await admin.storage.from("teacher-documents").remove([mirror.storage_path]);
        await admin.from("teacher_document_files").delete().eq("id", mirror.id);
      }
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiFailure(error, "Could not delete the document.");
  }
}
