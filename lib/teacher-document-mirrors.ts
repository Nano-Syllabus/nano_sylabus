import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * PREVIEW MIRRORS THAT OUTLIVED THEIR FILE.
 *
 * `teacher_document_files` is the student Library's list of a subject's files
 * (it holds the private preview). The creator's shelves read the collection
 * itself. The two drifted: a delete that could not find its mirror by exact
 * path left the row behind, so a student saw three syllabus files where the
 * creator had one (2026-09-29).
 *
 * `/v1/collection/documents` is a walk of the files on disk — every file,
 * indexed or not — so a mirror that matches none of them names nothing. Only
 * rows older than `MIN_AGE_MS` are touched: a mirror is written just after its
 * upload, and a listing read a moment before that upload landed must not
 * delete it.
 */
const MIN_AGE_MS = 15 * 60 * 1000;

type Mirror = {
  id: string;
  collection_path: string | null;
  external_document_id: string | null;
  storage_path?: string | null;
  created_at?: string | null;
};

function clean(path: string) {
  return path.replace(/^\/+|\/+$/g, "").toLowerCase();
}

/** A path as written by either side: with or without the namespace in front. */
function pathKeys(path: string) {
  const segments = clean(path).split("/").filter(Boolean);
  const keys = new Set<string>();
  if (segments.length) keys.add(segments.join("/"));
  if (segments.length > 1) keys.add(segments.slice(1).join("/"));
  if (segments.length > 2) keys.add(segments.slice(-3).join("/"));
  return [...keys];
}

/** Exported for tests. The mirrors that match no file in the collection. */
export function orphanedMirrors(
  mirrors: Mirror[],
  documents: Array<Record<string, unknown>>,
  now = Date.now(),
) {
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const document of documents) {
    for (const key of ["document_id", "id"]) {
      const value = document[key];
      if (typeof value === "string" && value) ids.add(value);
    }
    for (const key of ["path", "source_path"]) {
      const value = document[key];
      if (typeof value === "string" && value) pathKeys(value).forEach((path) => paths.add(path));
    }
  }
  // An empty listing is far more likely a bad read than a collection with no
  // files: never prune against it.
  if (!documents.length) return [];
  return mirrors.filter((mirror) => {
    const created = Date.parse(mirror.created_at || "");
    if (!Number.isFinite(created) || now - created < MIN_AGE_MS) return false;
    if (mirror.external_document_id && ids.has(mirror.external_document_id)) return false;
    const path = mirror.collection_path || "";
    if (!path) return false;
    return !pathKeys(path).some((key) => paths.has(key));
  });
}

/** Delete the orphans (row and stored preview). Best effort; never throws. */
export async function pruneOrphanedMirrors(
  admin: SupabaseClient,
  teacherId: string,
  documents: Array<Record<string, unknown>>,
) {
  try {
    const { data, error } = await admin
      .from("teacher_document_files")
      .select("id,collection_path,external_document_id,storage_path,created_at")
      .eq("teacher_id", teacherId);
    if (error) throw error;
    const orphans = orphanedMirrors((data || []) as Mirror[], documents);
    if (!orphans.length) return 0;
    const storagePaths = orphans
      .map((mirror) => mirror.storage_path || "")
      .filter(Boolean);
    if (storagePaths.length) {
      await admin.storage.from("teacher-documents").remove(storagePaths);
    }
    const removed = await admin
      .from("teacher_document_files")
      .delete()
      .eq("teacher_id", teacherId)
      .in(
        "id",
        orphans.map((mirror) => mirror.id),
      );
    if (removed.error) throw removed.error;
    return orphans.length;
  } catch (cause) {
    console.warn("[teacher mirrors] orphan cleanup failed", cause);
    return 0;
  }
}
