import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import {
  askTeacherSubject,
  getTeacherSubjects,
  TeacherApiError,
  type ApiRecord,
} from "@/lib/teacher-app/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ChatTurn = { role?: unknown; content?: unknown };
type SafeChatTurn = { role: "user" | "assistant"; content: string };

function chatHistory(value: unknown): SafeChatTurn[] {
  if (!Array.isArray(value)) return [];
  const history: SafeChatTurn[] = [];
  value.slice(-10).forEach((turn: ChatTurn) => {
    const role = turn?.role;
    const content = typeof turn?.content === "string" ? turn.content.trim().slice(0, 4_000) : "";
    if ((role === "user" || role === "assistant") && content) history.push({ role, content });
  });
  return history;
}

function sourceFromChunk(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const chunk = value as ApiRecord;
  const source = chunk.source && typeof chunk.source === "object" ? chunk.source as ApiRecord : {};
  const name = String(source.filename || source.doc || source.source_path || "Source");
  const location = [source.page ? `page ${source.page}` : "", source.section || ""]
    .filter(Boolean)
    .join(" · ") || "indexed material";
  return { name, where: location, score: typeof chunk.score === "number" ? chunk.score : null };
}

export async function POST(request: Request) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => null)) as {
      question?: unknown;
      subjectSlug?: unknown;
      history?: unknown;
    } | null;
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    const subjectSlug = typeof body?.subjectSlug === "string" ? body.subjectSlug.trim() : "";
    if (!question || question.length > 2_000) {
      return NextResponse.json({ error: "Enter a question up to 2,000 characters." }, { status: 400 });
    }
    if (!subjectSlug || subjectSlug.length > 200) {
      return NextResponse.json({ error: "Choose a valid subject." }, { status: 400 });
    }

    const subjects = await getTeacherSubjects(teacher.collection_sk);
    const subject = subjects.subjects.find((item) => item.slug === subjectSlug);
    if (!subject) {
      return NextResponse.json({ error: "Subject not found in this teacher collection." }, { status: 404 });
    }

    const languageInstruction = user.user_metadata?.teacher_language === "RN" ? "Respond in natural Nepali." : "Respond in English.";
    const styleInstruction = user.user_metadata?.teacher_answer_style === "concise"
      ? "Explain simply and concisely; put formulas after the plain-language explanation."
      : "Use an exam-focused answer with steps, marks logic, and examiner-friendly wording.";
    const result = await askTeacherSubject(
      teacher.collection_sk,
      typeof subject.name === "string" ? subject.name : subjectSlug,
      question,
      5,
      `${languageInstruction} ${styleInstruction}`,
      chatHistory(body?.history),
    );
    const chunks = Array.isArray(result.chunks) ? result.chunks : [];
    const sources = chunks.map(sourceFromChunk).filter((source) => source !== null);

    return NextResponse.json({
      answer: typeof result.answer === "string" ? result.answer : "",
      answerId: typeof result.answer_id === "string" ? result.answer_id : "",
      qualityScore: typeof result.quality_score === "number" ? result.quality_score : null,
      sources,
    });
  } catch (error) {
    const apiError = error instanceof TeacherApiError ? error : null;
    const invalidKey = apiError?.status === 401;
    return NextResponse.json(
      {
        error: invalidKey
          ? "This teacher workspace key is no longer valid."
          : apiError?.status === 404
            ? "No indexed material was found for this subject."
            : "Could not answer from this subject's material.",
      },
      { status: invalidKey ? 409 : apiError?.status === 404 ? 404 : 502 },
    );
  }
}
