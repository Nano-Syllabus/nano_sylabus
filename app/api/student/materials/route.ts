import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantSourceTree, type TenantSourceTreeNode } from "@/lib/tenant/client";
import { findPublishedSubject, getPublishedCatalog } from "@/lib/tenant/marketplace-catalog";

export const dynamic = "force-dynamic";

type Material = {
  name: string;
  /** Syllabus, Notes, Question Bank — the shelf the teacher filed it under. */
  shelf: string;
  path: string;
  indexed: boolean;
  documentId: string;
  sizeBytes: number;
};

/** Collects the files under a subject folder, remembering which shelf each sat on. */
function collectFiles(nodes: TenantSourceTreeNode[], trail: string[] = []): Material[] {
  const files: Material[] = [];

  for (const node of nodes) {
    const next = [...trail, node.name];
    const children = Array.isArray(node.children) ? node.children : [];

    if (children.length) {
      files.push(...collectFiles(children, next));
      continue;
    }

    // A leaf directly under the subject folder has no shelf of its own.
    const file = node as TenantSourceTreeNode & { document_id?: string; size?: number };
    files.push({
      name: node.name,
      shelf: next.length > 1 ? next[next.length - 2] : "",
      path: next.join("/"),
      indexed: node.indexed === true,
      documentId: file.document_id ?? "",
      sizeBytes: Number(file.size ?? 0),
    });
  }

  return files;
}

function findFolder(nodes: TenantSourceTreeNode[], segments: string[]): TenantSourceTreeNode[] | null {
  if (!segments.length) return nodes;

  const [head, ...rest] = segments;
  const match = nodes.find((node) => node.name === head);
  if (!match) return null;

  return findFolder(Array.isArray(match.children) ? match.children : [], rest);
}

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const requested = new URL(request.url).searchParams.get("subject")?.trim();
    if (!requested) return NextResponse.json({ error: "A subject is required." }, { status: 400 });

    const catalog = await getPublishedCatalog();
    const subject = findPublishedSubject(catalog, requested);
    if (!subject) {
      return NextResponse.json({ error: "That subject is not published." }, { status: 404 });
    }

    const tree = await getTenantSourceTree();
    const folder = findFolder(tree.tree ?? [], subject.folderPath.split("/"));

    return NextResponse.json({
      subject: { name: subject.name, providerName: subject.providerName },
      materials: folder ? collectFiles(folder) : [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load this subject's material." },
      { status: 502 },
    );
  }
}
