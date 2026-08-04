import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import {
  deleteTeacherDocument,
  indexTeacherDocument,
  TeacherApiError,
} from "@/lib/teacher-app/client";

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

    await deleteTeacherDocument(teacher.collection_sk, id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiFailure(error, "Could not delete the document.");
  }
}
