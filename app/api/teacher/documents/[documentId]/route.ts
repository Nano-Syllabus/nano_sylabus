import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import {
  deleteTeacherDocument,
  getTeacherDocument,
  indexTeacherDocument,
  TeacherApiError,
} from "@/lib/teacher-app/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { teacher, id } = await teacherAndDocumentId(context);
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!id) return NextResponse.json({ error: "Invalid document." }, { status: 400 });
    const document = await getTeacherDocument(teacher.collection_sk, id);
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

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { teacher, id } = await teacherAndDocumentId(context);
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!id) return NextResponse.json({ error: "Invalid document." }, { status: 400 });

    const result = await indexTeacherDocument(teacher.collection_sk, { documentId: id });
    return NextResponse.json({ result, jobId: resultJobId(result) });
  } catch (error) {
    return apiFailure(error, "Could not re-index the document.");
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
