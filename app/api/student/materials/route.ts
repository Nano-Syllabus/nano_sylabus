import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getStudentCourseSubjectAccess,
  getStudentCourseSubjectAccessForCourse,
  listCreatorPrivateSubjectAccess,
  listStudentCourses,
  type StudentCourseSubjectAccess,
} from "@/lib/student-courses";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantSourceTree, type TenantSourceTreeNode } from "@/lib/tenant/client";

export const dynamic = "force-dynamic";

type Material = {
  name: string;
  shelf: string;
  path: string;
  indexed: boolean;
  documentId: string;
  sizeBytes: number;
  mimeType: string;
  previewAvailable: boolean;
};

type DbMaterialFile = {
  id: string;
  external_document_id: string | null;
  collection_path: string | null;
  storage_path: string | null;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
};

type TenantFileNode = TenantSourceTreeNode & {
  document_id?: string;
  material_id?: number;
  path?: string;
  size?: number;
  size_bytes?: number;
};

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out.")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function collectFiles(nodes: TenantSourceTreeNode[], trail: string[] = []): Material[] {
  const files: Material[] = [];

  for (const node of nodes) {
    const next = [...trail, node.name];
    const children = Array.isArray(node.children) ? node.children : [];
    const file = node as TenantFileNode;
    const isRealFile =
      node.type === "file" || Boolean(file.document_id) || typeof file.material_id === "number";

    if (children.length) {
      files.push(...collectFiles(children, next));
      continue;
    }

    if (!isRealFile) continue;

    files.push({
      name: node.name,
      shelf: next[0] || "",
      path: file.path || next.join("/"),
      indexed: node.indexed === true,
      documentId: file.document_id ?? "",
      sizeBytes: Number(file.size ?? file.size_bytes ?? 0),
      mimeType: "application/pdf",
      previewAvailable: false,
    });
  }

  return files;
}

function findFolder(
  nodes: TenantSourceTreeNode[],
  segments: string[],
): TenantSourceTreeNode[] | null {
  if (!segments.length) return nodes;

  const [head, ...rest] = segments;
  const headLower = head.trim().toLowerCase();
  const match = nodes.find((node) => node.name.trim().toLowerCase() === headLower);

  if (match) {
    const subResult = findFolder(Array.isArray(match.children) ? match.children : [], rest);
    if (subResult && subResult.length > 0) return subResult;
  }

  // Fallback: search recursively for any node whose name matches the last segment (subject name)
  const targetSubject = segments[segments.length - 1].trim().toLowerCase();
  function findByName(items: TenantSourceTreeNode[]): TenantSourceTreeNode[] | null {
    for (const item of items) {
      if (item.name.trim().toLowerCase() === targetSubject && Array.isArray(item.children)) {
        return item.children;
      }
      if (Array.isArray(item.children)) {
        const found = findByName(item.children);
        if (found) return found;
      }
    }
    return null;
  }

  return findByName(nodes);
}

async function loadSubjectMaterials(
  access: StudentCourseSubjectAccess,
  admin: ReturnType<typeof createSupabaseAdminClient>,
  sourceTreePromise: Promise<TenantSourceTreeNode[]> | null,
): Promise<Material[]> {
  let files: Material[] = [];

  // Private upload mirrors are the source of truth for student previews. Read
  // them first so the library remains available if the indexing service is slow.
  try {
    const normalizedFolder = access.folderPath.replace(/^\/+|\/+$/g, "");
    const { data, error } = await withTimeout(
      admin
        .from("teacher_document_files")
        .select(
          "id, external_document_id, collection_path, storage_path, original_name, mime_type, size_bytes",
        )
        .eq("teacher_id", access.teacherId)
        .ilike("collection_path", `${normalizedFolder}/%`)
        .order("created_at", { ascending: false }),
      6_000,
    );
    if (error) throw error;

    const normalizedFolderLower = normalizedFolder.toLowerCase();
    files = ((data || []) as DbMaterialFile[])
      .filter((row) => {
        const candidate = (row.collection_path || "").replace(/^\/+|\/+$/g, "").toLowerCase();
        return candidate.startsWith(`${normalizedFolderLower}/`);
      })
      .map((row) => {
        const collectionPath = row.collection_path || "";
        const relativePath = collectionPath.slice(normalizedFolder.length).replace(/^\/+/, "");
        const parts = relativePath.split("/").filter(Boolean);
        const fileName = row.original_name || parts.at(-1) || "Document.pdf";
        return {
          name: fileName,
          shelf: parts.length > 1 ? parts[0] : "Materials",
          path: collectionPath || fileName,
          indexed: Boolean(row.external_document_id),
          documentId: row.id,
          sizeBytes: Number(row.size_bytes || 0),
          mimeType: row.mime_type || "application/octet-stream",
          previewAvailable: Boolean(row.storage_path),
        };
      });
  } catch {
    // Fall through to the indexing service tree for older external-only files.
  }

  // Older documents may exist only in the indexing service. They can still be
  // listed, although the UI will explain when a private preview is unavailable.
  if (!files.length) {
    try {
      const tree = sourceTreePromise
        ? await sourceTreePromise
        : ((await withTimeout(getTenantSourceTree(), 6_000)).tree ?? []);
      const folder = findFolder(tree, access.folderPath.split("/").filter(Boolean));
      if (folder && folder.length > 0) {
        files = collectFiles(folder);
      }
    } catch {
      // The empty state below is more useful than turning a missing upstream
      // source tree into a broken chat screen.
    }
  }

  return files;
}

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: NO_STORE_HEADERS },
      );

    const admin = createSupabaseAdminClient();
    const requested = new URL(request.url).searchParams.get("subject")?.trim();

    // With no subject selected, return the complete library for every enrolled
    // course subject. This keeps the library useful before the chat composer
    // has a subject context.
    if (!requested) {
      const [courses, privateSubjects] = await Promise.all([
        listStudentCourses(user.id, admin),
        listCreatorPrivateSubjectAccess(user.id, admin),
      ]);
      const sourceTreePromise = getTenantSourceTree()
        .then((result) => result.tree ?? [])
        .catch(() => [] as TenantSourceTreeNode[]);
      const courseEntries = (
        await Promise.all(
          courses.flatMap((course) =>
            course.subjects.map(async (courseSubject) => {
              const access = await getStudentCourseSubjectAccessForCourse(
                user.id,
                course.id,
                courseSubject.slug,
                admin,
              );
              if (!access) return null;
              return {
                courseId: course.id,
                courseName: course.name,
                subject: {
                  name: access.subjectName || courseSubject.name,
                  slug: access.subjectSlug || courseSubject.slug,
                },
                materials: await loadSubjectMaterials(access, admin, sourceTreePromise),
              };
            }),
          ),
        )
      ).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

      const privateEntries = await Promise.all(
        privateSubjects.map(async (access) => ({
          courseId: access.courseId,
          courseName: "Private",
          private: true,
          subject: { name: access.subjectName, slug: access.subjectSlug },
          materials: await loadSubjectMaterials(access, admin, sourceTreePromise),
        })),
      );

      return NextResponse.json(
        { subjects: [...courseEntries, ...privateEntries] },
        { headers: NO_STORE_HEADERS },
      );
    }

    const access = await getStudentCourseSubjectAccess(user.id, requested, admin);
    if (!access) {
      return NextResponse.json(
        { error: "Enroll in a course containing this subject first." },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }

    const files = await loadSubjectMaterials(access, admin, null);

    return NextResponse.json(
      {
        subject: {
          name: access.subjectName,
          slug: access.subjectSlug,
          courseId: access.courseId,
        },
        materials: files,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load this subject's material." },
      { status: 502, headers: NO_STORE_HEADERS },
    );
  }
}
