import { normalizeBoard, normalizeGrade, normalizeSubjectLabel } from "@/lib/profile-normalization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface KnowledgeCatalogOptions {
  boards: string[];
  gradesByBoard: Record<string, string[]>;
  subjectsByBoardGrade: Record<string, string[]>;
}

function sortValues(values: Set<string>) {
  return Array.from(values).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }),
  );
}

function keyForBoardGrade(board: string, grade: string) {
  return `${board}::${grade}`;
}

export async function listKnowledgeCatalogOptions(): Promise<KnowledgeCatalogOptions> {
  const supabase = createSupabaseAdminClient();

  const [documentsResult, notebooksResult] = await Promise.all([
    supabase
      .from("knowledge_documents")
      .select("board, grade, subject")
      .eq("processing_status", "ready")
      .gt("chunk_count", 0),
    supabase.from("knowledge_notebooks").select("board, level, subject").neq("title", ""),
  ]);

  if (documentsResult.error) throw documentsResult.error;
  if (notebooksResult.error) throw notebooksResult.error;

  const boards = new Set<string>();
  const gradesByBoard = new Map<string, Set<string>>();
  const subjectsByBoardGrade = new Map<string, Set<string>>();

  const applyRow = (boardValue: string | null, gradeValue: string | null, subjectValue: string | null) => {
    const board = normalizeBoard(boardValue ?? "");
    const grade = normalizeGrade(gradeValue ?? "");
    const subject = normalizeSubjectLabel(subjectValue ?? "");
    if (!board || !grade || !subject) return;

    boards.add(board);

    const grades = gradesByBoard.get(board) ?? new Set<string>();
    grades.add(grade);
    gradesByBoard.set(board, grades);

    const boardGradeKey = keyForBoardGrade(board, grade);
    const subjects = subjectsByBoardGrade.get(boardGradeKey) ?? new Set<string>();
    subjects.add(subject);
    subjectsByBoardGrade.set(boardGradeKey, subjects);
  };

  const readyDocuments = documentsResult.data ?? [];
  if (readyDocuments.length > 0) {
    readyDocuments.forEach((row) => applyRow(row.board, row.grade, row.subject));
  } else {
    (notebooksResult.data ?? []).forEach((row) => applyRow(row.board, row.level, row.subject));
  }

  return {
    boards: sortValues(boards),
    gradesByBoard: Object.fromEntries(
      Array.from(gradesByBoard.entries()).map(([board, grades]) => [board, sortValues(grades)]),
    ),
    subjectsByBoardGrade: Object.fromEntries(
      Array.from(subjectsByBoardGrade.entries()).map(([boardGrade, subjects]) => [boardGrade, sortValues(subjects)]),
    ),
  };
}
