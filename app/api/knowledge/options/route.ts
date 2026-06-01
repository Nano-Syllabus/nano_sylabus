import { NextResponse } from "next/server";
import { normalizeBoard, normalizeGrade } from "@/lib/profile-normalization";
import { listKnowledgeCatalogOptions } from "@/lib/data/knowledge-catalog";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function keyForBoardGrade(board: string, grade: string) {
  return `${board}::${grade}`;
}

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = new URL(request.url).searchParams;
    const board = normalizeBoard(params.get("board") ?? "");
    const grade = normalizeGrade(params.get("grade") ?? "");

    const catalog = await listKnowledgeCatalogOptions();
    const grades = board ? (catalog.gradesByBoard[board] ?? []) : [];
    const subjects = board && grade ? (catalog.subjectsByBoardGrade[keyForBoardGrade(board, grade)] ?? []) : [];

    return NextResponse.json({
      ...catalog,
      board,
      grade,
      grades,
      subjects,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load knowledge options." },
      { status: 500 },
    );
  }
}
