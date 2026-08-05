import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTeacherCollectionPapers } from "@/lib/teacher-app/client";
import { normalizeTeacherBackendPaper, teacherPaperList } from "@/lib/teacher-paper-api";

export async function GET() {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("teacher_exam_papers")
      .select("id,external_paper_id,paper,created_at,updated_at,archived_at")
      .eq("teacher_id", teacher.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);
    const activeRows = (data || []).filter((row) => !row.archived_at);
    const archivedIds = new Set((data || []).filter((row) => row.archived_at).map((row) => row.external_paper_id));
    const localPapers = activeRows.flatMap((row) => {
      if (!row.paper || typeof row.paper !== "object") return [];
      return [{ ...row.paper, appPaperId: row.id, createdAt: row.created_at, updatedAt: row.updated_at }];
    });

    try {
      const backend = await getTeacherCollectionPapers(teacher.collection_sk);
      const remotePapers = teacherPaperList(backend)
        .map((paper) => normalizeTeacherBackendPaper(paper))
        .filter((paper): paper is NonNullable<typeof paper> => paper !== null)
        .filter((paper) => !archivedIds.has(paper.id));
      const localById = new Map(localPapers.map((paper) => [String((paper as { id?: unknown }).id || ""), paper]));
      const merged = remotePapers.map((paper) => {
        const local = localById.get(paper.id);
        if (!local) return paper;
        localById.delete(paper.id);
        return { ...paper, ...local, questions: Array.isArray((local as { questions?: unknown }).questions) ? (local as { questions: unknown[] }).questions : paper.questions };
      });
      return NextResponse.json({ papers: [...merged, ...localById.values()], source: "collection-api" });
    } catch {
      return NextResponse.json({
        papers: localPapers,
        source: "local-cache",
        syncWarning: "Backend paper history is temporarily unavailable. Showing the app's saved copies.",
      });
    }
  } catch {
    return NextResponse.json(
      { error: "Could not load generated papers. Apply the latest Supabase migration." },
      { status: 502 },
    );
  }
}
