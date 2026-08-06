import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublishedCatalog } from "@/lib/tenant/marketplace-catalog";
import {
  fetchTenantDocumentRaw,
  getTenantSourceTree,
  type TenantSourceTreeNode,
} from "@/lib/tenant/client";

export const dynamic = "force-dynamic";

type FileNode = TenantSourceTreeNode & { document_id?: string; path?: string };

/** Finds which folder a document sits in, so it can be checked against the catalog. */
function findDocumentPath(nodes: TenantSourceTreeNode[], documentId: string): string | null {
  for (const node of nodes) {
    const children = Array.isArray(node.children) ? node.children : [];
    if (children.length) {
      const found = findDocumentPath(children, documentId);
      if (found) return found;
      continue;
    }

    const file = node as FileNode;
    if (file.document_id === documentId) return file.path ?? "";
  }

  return null;
}

/**
 * Streams one of a teacher's files back to the student. The tenant key never
 * reaches the browser, and a document is only served when it sits inside a
 * subject that teacher has actually published.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { documentId } = await params;
    if (!documentId.trim()) {
      return NextResponse.json({ error: "A document id is required." }, { status: 400 });
    }

    const [tree, catalog] = await Promise.all([getTenantSourceTree(), getPublishedCatalog()]);
    const path = findDocumentPath(tree.tree ?? [], documentId);
    if (path === null) return NextResponse.json({ error: "File not found." }, { status: 404 });

    const published = catalog.subjects.some((subject) => path.startsWith(`${subject.folderPath}/`));
    if (!published) {
      return NextResponse.json({ error: "That file is not published." }, { status: 403 });
    }

    const file = await fetchTenantDocumentRaw(documentId);
    const name = path.split("/").pop() || "file";

    return new NextResponse(new Uint8Array(file.body), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `inline; filename="${name.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not fetch that file." },
      { status: 502 },
    );
  }
}
