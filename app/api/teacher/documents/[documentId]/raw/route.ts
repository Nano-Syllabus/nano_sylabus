import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import {
  fetchTeacherDocumentRaw,
  getTeacherDocument,
  TeacherApiError,
} from "@/lib/teacher-app/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ documentId: string }> };
type ApiRecord = Record<string, unknown>;

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

function errorResponse(error: unknown) {
  if (error instanceof TeacherApiError) {
    return NextResponse.json(
      { error: error.status === 404 ? "Document not found." : error.message },
      { status: error.status === 401 ? 409 : error.status },
    );
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Could not load the preview." },
    { status: 502 },
  );
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const teacher = await getTeacherProfile();
    const { documentId } = await context.params;
    const id = documentId.trim();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!id || id.length > 200) {
      return NextResponse.json({ error: "Invalid document." }, { status: 400 });
    }

    const document = await getTeacherDocument(teacher.collection_sk, id);
    const path = documentPath(document);
    const backendId = backendDocumentId(document) || id;
    const mirror = await findMirror(teacher.id, backendId, path);

    if (mirror?.storage_path) {
      const admin = createSupabaseAdminClient();
      const download = await admin.storage.from("teacher-documents").download(mirror.storage_path);
      if (download.error || !download.data) throw download.error || new Error("File unavailable.");
      const body = await download.data.arrayBuffer();
      return new NextResponse(new Uint8Array(body), {
        headers: {
          "Content-Type": mirror.mime_type || download.data.type || "application/octet-stream",
          "Content-Disposition": `inline; filename="${String(mirror.original_name || "file").replace(/"/g, "")}"`,
          "Cache-Control": "private, max-age=300",
        },
      });
    }

    const raw = await fetchTeacherDocumentRaw(teacher.collection_sk, backendId);
    const name =
      typeof document.name === "string" ? document.name : path.split("/").pop() || "file";
    return new NextResponse(new Uint8Array(raw.body), {
      headers: {
        "Content-Type": raw.contentType,
        "Content-Disposition": `inline; filename="${name.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
