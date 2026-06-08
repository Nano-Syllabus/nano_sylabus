import { normalizeBoard, normalizeGrade, normalizeSubjectLabel } from "@/lib/profile-normalization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { TopicCard } from "@/lib/types";

type SupabaseTopicCardClient = Pick<ReturnType<typeof createSupabaseAdminClient>, "from">;

function getTopicCardClient(client?: SupabaseTopicCardClient) {
  return client ?? createSupabaseAdminClient();
}

function normalizeFreeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeFreeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function isMissingTopicCardsTableError(error: { message?: string | null; details?: string | null } | null | undefined) {
  const text = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  if (!text.includes("topic_cards")) return false;
  return (
    text.includes("schema cache") ||
    text.includes("does not exist") ||
    text.includes("could not find the table") ||
    text.includes("relation")
  );
}

export function normalizeTopicCardRow(row: Record<string, unknown>): TopicCard {
  const statusValue = typeof row.status === "string" ? row.status : "draft";
  return {
    id: String(row.id ?? ""),
    documentId: typeof row.document_id === "string" ? row.document_id : null,
    board: normalizeBoard(typeof row.board === "string" ? row.board : ""),
    grade: normalizeGrade(typeof row.grade === "string" ? row.grade : ""),
    subject: normalizeSubjectLabel(typeof row.subject === "string" ? row.subject : ""),
    chapter: typeof row.chapter === "string" && row.chapter.trim() ? row.chapter.trim() : null,
    topic: typeof row.topic === "string" ? row.topic.trim() : "",
    title: typeof row.title === "string" ? row.title.trim() : "",
    keyTerms: normalizeStringArray(row.key_terms),
    coreExplanation: normalizeStringArray(row.core_explanation),
    formulaSheet: normalizeStringArray(row.formula_sheet),
    exampleLine: typeof row.example_line === "string" && row.example_line.trim() ? row.example_line.trim() : null,
    commonMistake:
      typeof row.common_mistake === "string" && row.common_mistake.trim() ? row.common_mistake.trim() : null,
    examAngle: typeof row.exam_angle === "string" && row.exam_angle.trim() ? row.exam_angle.trim() : null,
    status:
      statusValue === "published" || statusValue === "reviewed" || statusValue === "draft"
        ? statusValue
        : "draft",
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
  };
}

function scoreTopicCard({
  card,
  board,
  grade,
  subject,
  chapter,
  topic,
  question,
}: {
  card: TopicCard;
  board: string;
  grade: string;
  subject: string;
  chapter: string;
  topic: string;
  question: string;
}) {
  let score = 0;
  if (!card.subject || card.subject !== subject) return Number.NEGATIVE_INFINITY;

  score += 120;
  if (board && card.board === board) score += 35;
  if (grade && card.grade === grade) score += 35;

  const cardChapter = (card.chapter ?? "").trim().toLowerCase();
  const cardTopic = card.topic.trim().toLowerCase();
  const requestedChapter = chapter.trim().toLowerCase();
  const requestedTopic = topic.trim().toLowerCase();

  if (requestedChapter && cardChapter === requestedChapter) score += 55;
  if (requestedTopic && cardTopic === requestedTopic) score += 70;

  const questionTokens = new Set(tokenize(question));
  const cardTokens = new Set([
    ...tokenize(card.title),
    ...tokenize(card.topic),
    ...tokenize(card.chapter ?? ""),
    ...card.keyTerms.flatMap((term) => tokenize(term)),
  ]);

  let overlap = 0;
  for (const token of questionTokens) {
    if (cardTokens.has(token)) overlap += 1;
  }
  score += overlap * 8;

  if (card.formulaSheet.length > 0 && /\bformula|equation|derive|derivation|calculate|numerical\b/i.test(question)) {
    score += 10;
  }
  if (card.examAngle && /\bexam|likely|important|question\b/i.test(question)) {
    score += 10;
  }

  return score;
}

export async function findBestTopicCard(
  filters: {
    subject: string;
    question: string;
    board?: string | null;
    grade?: string | null;
    chapter?: string | null;
    topic?: string | null;
  },
  client?: SupabaseTopicCardClient,
) {
  const supabase = getTopicCardClient(client);
  const subject = normalizeSubjectLabel(filters.subject);
  const board = normalizeBoard(filters.board ?? "");
  const grade = normalizeGrade(filters.grade ?? "");
  const chapter = (filters.chapter ?? "").trim();
  const topic = (filters.topic ?? "").trim();
  if (!subject) return null;

  const { data, error } = await supabase.from("topic_cards").select("*");
  if (error) {
    // Topic cards are an optional accelerator. If the table is not deployed yet,
    // the runtime should fall back to derived context instead of crashing chat.
    if (isMissingTopicCardsTableError(error)) return null;
    throw error;
  }

  const candidates = (data ?? [])
    .map((row) => normalizeTopicCardRow(row as Record<string, unknown>))
    .filter((card) => card.status === "published")
    .map((card) => ({
      card,
      score: scoreTopicCard({
        card,
        board,
        grade,
        subject,
        chapter,
        topic,
        question: filters.question,
      }),
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => right.score - left.score);

  return candidates[0]?.card ?? null;
}
