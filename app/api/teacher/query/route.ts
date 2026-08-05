import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherProfile } from "@/app/teachers/actions";
import {
  getTeacherSubjects,
  retrieveTeacherChunks,
  TeacherApiError,
  type ApiRecord,
} from "@/lib/teacher-app/client";

const requestSchema = z.object({
  query: z.string().trim().min(1).max(2_000),
  subjectSlug: z.string().trim().min(1).max(200),
  topK: z.number().int().min(1).max(20).optional().default(8),
});

function resultChunk(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const chunk = value as ApiRecord;
  const source = chunk.source && typeof chunk.source === "object" ? chunk.source as ApiRecord : {};
  const metadata = chunk.metadata && typeof chunk.metadata === "object" ? chunk.metadata as ApiRecord : {};
  const name = String(source.filename || source.doc || source.source_path || metadata.filename || metadata.source || "Indexed source");
  const where = [
    source.page || metadata.page ? `page ${String(source.page || metadata.page)}` : "",
    String(source.section || metadata.section || ""),
  ].filter(Boolean).join(" · ") || "indexed material";
  const content = String(chunk.text || chunk.content || chunk.chunk || chunk.snippet || "").trim();
  return {
    id: String(chunk.id || metadata.id || `${name}-${where}-${content.slice(0, 40)}`),
    name,
    where,
    content,
    score: typeof chunk.score === "number" ? chunk.score : null,
  };
}

export async function POST(request: Request) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid source search." }, { status: 400 });
    }

    const subjects = await getTeacherSubjects(teacher.collection_sk);
    if (!subjects.subjects.some((subject) => subject.slug === parsed.data.subjectSlug)) {
      return NextResponse.json({ error: "Subject not found in this teacher collection." }, { status: 404 });
    }

    const result = await retrieveTeacherChunks(
      teacher.collection_sk,
      parsed.data.query,
      parsed.data.topK,
      parsed.data.subjectSlug,
    );
    const raw = Array.isArray(result.chunks)
      ? result.chunks
      : Array.isArray(result.results)
        ? result.results
        : [];
    return NextResponse.json({
      results: raw.map(resultChunk).filter((chunk) => chunk !== null),
    });
  } catch (error) {
    const apiError = error instanceof TeacherApiError ? error : null;
    return NextResponse.json(
      {
        error: apiError?.status === 401
          ? "This teacher workspace key is no longer valid."
          : apiError?.status === 404
            ? "No indexed material matched this search."
            : "Could not search this subject's indexed material.",
      },
      { status: apiError?.status === 401 ? 409 : apiError?.status === 404 ? 404 : 502 },
    );
  }
}
