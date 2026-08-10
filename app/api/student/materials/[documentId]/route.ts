import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchTenantDocumentRaw,
  getTenantDocument,
  getTenantSourceTree,
  listTenantSubjects,
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
 * subject exposed by the tenant subject API.
 */
export async function GET(
  request: Request,
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

    const [tree, subjects] = await Promise.all([getTenantSourceTree(), listTenantSubjects()]);
    const path = findDocumentPath(tree.tree ?? [], documentId);
    if (path === null) return NextResponse.json({ error: "File not found." }, { status: 404 });

    const available = subjects.some((subject) => path.startsWith(`${subject.folder_path}/`));
    if (!available) {
      return NextResponse.json({ error: "That file is not available." }, { status: 403 });
    }

    if (new URL(request.url).searchParams.get("metadata") === "1") {
      const document = await getTenantDocument(documentId);
      return NextResponse.json(
        { document },
        { headers: { "Cache-Control": "private, max-age=60" } },
      );
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
    const message = error instanceof Error ? error.message : "";
    if (/missing tenant API scope:\s*documents:read/i.test(message)) {
      return NextResponse.json(
        { error: "Document details are not enabled for this app yet." },
        { status: 503 },
      );
    }

    return NextResponse.json({ error: message || "Could not fetch that file." }, { status: 502 });
  }
}
