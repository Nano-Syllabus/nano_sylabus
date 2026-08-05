import type { ApiRecord } from "@/lib/teacher-app/client";

function record(value: unknown): ApiRecord {
  return value && typeof value === "object" ? value as ApiRecord : {};
}

function string(value: unknown) {
  return typeof value === "string" ? value : "";
}

function number(value: unknown) {
  return typeof value === "number" ? value : Number(value) || 0;
}

export function teacherPaperList(value: ApiRecord | ApiRecord[]) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value.papers) ? value.papers.map(record) : [];
}

export function normalizeTeacherBackendPaper(value: unknown, subjectSlug = "") {
  const paper = record(value);
  const id = string(paper.id || paper.paper_id || paper.set_id);
  if (!id) return null;
  const rawQuestions = Array.isArray(paper.questions) ? paper.questions : [];
  const questions = rawQuestions.flatMap((value) => {
    const question = record(value);
    const questionId = string(question.id || question.question_id);
    if (!questionId) return [];
    return [{
      id: questionId,
      chapter: string(question.chapter || question.topic),
      bandLabel: string(question.band_label || question.label),
      questionType: string(question.question_type || question.type),
      marks: number(question.marks || question.max_marks),
      text: string(question.text || question.question),
      referenceAnswer: string(question.reference_answer || question.model_answer),
    }];
  });
  const rawBands = Array.isArray(paper.bands) ? paper.bands : [];
  const totalMarks = number(paper.total_marks || paper.full_marks)
    || questions.reduce((sum, question) => sum + question.marks, 0);

  return {
    id,
    appPaperId: "",
    title: string(paper.title) || "Untitled exam",
    subject: string(paper.subject || paper.subject_name) || "Subject",
    subjectSlug: string(paper.subject_slug) || subjectSlug,
    totalMarks,
    passMarks: number(paper.pass_marks),
    kind: "exam" as const,
    timeLimitMinutes: number(paper.time_limit_minutes) || 60,
    attempts: 1,
    shareUrl: string(paper.share_url || paper.public_url),
    createdAt: string(paper.created_at),
    questions,
    bands: rawBands,
  };
}
