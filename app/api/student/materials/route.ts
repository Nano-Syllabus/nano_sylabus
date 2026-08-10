import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  findTenantSubject,
  getTenantSourceTree,
  listTenantSubjects,
  type TenantSourceTreeNode,
} from "@/lib/tenant/client";

export const dynamic = "force-dynamic";

type Material = {
  name: string;
  shelf: string;
  path: string;
  indexed: boolean;
  documentId: string;
  sizeBytes: number;
};

type DbMaterialFile = {
  id: string;
  external_document_id: string | null;
  collection_path: string | null;
  original_name: string | null;
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

    const requested = new URL(request.url).searchParams.get("subject")?.trim();
    if (!requested) {
      return NextResponse.json(
        { error: "A subject is required." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const subjects = await withTimeout(listTenantSubjects(), 5_000);
    const subject = findTenantSubject(subjects, requested);
    if (!subject) {
      return NextResponse.json(
        { error: "That subject is not available." },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    let files: Material[] = [];

    // Attempt 1: Fetch source tree from tenant API
    try {
      const tree = await withTimeout(getTenantSourceTree(), 6_000);
      const folderPathSegments = subject.folder_path.split("/");
      const folder = findFolder(tree.tree ?? [], folderPathSegments);
      if (folder && folder.length > 0) {
        files = collectFiles(folder);
      }
    } catch {
      // Ignore tenant API failure, proceed to Supabase fallback
    }

    // Attempt 2: If tenant API yielded no files, query Supabase teacher_document_files table
    if (!files.length) {
      try {
        const admin = createSupabaseAdminClient();
        const needles = Array.from(
          new Set(
            [
              subject.name,
              subject.folder_path.split("/").filter(Boolean).at(-1),
              subject.folder_path,
            ]
              .filter(Boolean)
              .map((value) => String(value)),
          ),
        );
        let dbFiles: DbMaterialFile[] | null = null;

        for (const needle of needles) {
          const { data } = await withTimeout<{ data: DbMaterialFile[] | null }>(
            admin
              .from("teacher_document_files")
              .select("id, external_document_id, collection_path, original_name, size_bytes")
              .ilike("collection_path", `%${needle}%`),
            6_000,
          );
          if (data?.length) {
            dbFiles = data;
            break;
          }
        }

        if (dbFiles && dbFiles.length > 0) {
          files = dbFiles.map((row) => {
            const parts = (row.collection_path || "").split("/").filter(Boolean);
            const fileName = row.original_name || parts[parts.length - 1] || "Document.pdf";
            const subjectIndex = parts.findIndex(
              (part) => part.toLowerCase() === subject.name.toLowerCase(),
            );
            const shelf = subjectIndex >= 0 ? parts[subjectIndex + 1] || "Files" : "Files";
            return {
              name: fileName,
              shelf,
              path: row.collection_path || fileName,
              indexed: true,
              documentId: row.external_document_id || row.id,
              sizeBytes: Number(row.size_bytes || 0),
            };
          });
        }
      } catch {
        // Fallback silently if database is not reachable
      }
    }

    return NextResponse.json(
      {
        subject: { name: subject.name, providerName: subject.namespace },
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
