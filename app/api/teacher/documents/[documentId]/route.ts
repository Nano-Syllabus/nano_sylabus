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
  for (const key of ["source_path", "path"] as const) {
    if (typeof value[key] === "string") return value[key];
  }
  return "";
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { teacher, id } = await teacherAndDocumentId(context);
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!id) return NextResponse.json({ error: "Invalid document." }, { status: 400 });
    const document = await getTeacherDocument(teacher.collection_sk, id);
    const path = documentPath(document);
    const admin = createSupabaseAdminClient();
    const { data: mirror } = await admin
      .from("teacher_document_files")
      .select("storage_path,original_name,mime_type,size_bytes")
      .eq("teacher_id", teacher.id)
      .eq("collection_path", path)
      .maybeSingle();
    let previewUrl = "";
    if (mirror?.storage_path) {
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
      } : null,
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
