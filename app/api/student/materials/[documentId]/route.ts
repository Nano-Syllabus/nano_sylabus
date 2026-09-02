import { NextResponse } from "next/server";
import {
  getStudentCourseSubjectAccess,
  getStudentCourseSubjectAccessForDocumentPath,
} from "@/lib/student-courses";
import {
  getTeacherDocument,
  getTeacherDocuments,
  TeacherApiError,
} from "@/lib/teacher-app/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getTenantSourceTree,
  listTenantSubjects,
  type TenantSourceTreeNode,
} from "@/lib/tenant/client";

export const dynamic = "force-dynamic";

type FileNode = TenantSourceTreeNode & { document_id?: string; path?: string };
type MirrorFile = {
  id: string;
  teacher_id: string;
  external_document_id: string | null;
  collection_path: string;
  storage_path: string;
  original_name: string;
  mime_type: string;
};

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

function documentPath(value: Record<string, unknown>) {
  for (const key of ["source_path", "path"] as const) {
    if (typeof value[key] === "string") return value[key];
  }
  return "";
}

function backendDocumentId(value: Record<string, unknown>) {
  for (const key of ["document_id", "id"] as const) {
    if (typeof value[key] === "string") return value[key];
  }
  return "";
}

function documentRows(value: Record<string, unknown> | Record<string, unknown>[]) {
  if (Array.isArray(value)) return value;
  for (const key of ["documents", "items", "data"] as const) {
    if (Array.isArray(value[key])) return value[key] as Record<string, unknown>[];
  }
  return [];
}

function pathCandidates(path: string, folderPath: string) {
  const clean = path.replace(/^\/+/, "");
  const candidates = new Set([clean]);
  const folder = folderPath.replace(/^\/+|\/+$/g, "");
  if (folder) {
    const index = clean.toLowerCase().indexOf(`${folder.toLowerCase()}/`);
    if (index >= 0) candidates.add(clean.slice(index));
  }
  const segments = clean.split("/").filter(Boolean);
  if (segments.length > 1) candidates.add(segments.slice(1).join("/"));
  return [...candidates].filter(Boolean);
}

function subjectForPath(
  subjects: Awaited<ReturnType<typeof listTenantSubjects>>,
  path: string,
) {
  const clean = path.replace(/^\/+|\/+$/g, "").toLowerCase();
  return subjects.find((item) => {
    const folder = item.folder_path.replace(/^\/+|\/+$/g, "").toLowerCase();
    const name = item.name.trim().toLowerCase();
    return (
      clean === folder ||
      clean.startsWith(`${folder}/`) ||
      clean.endsWith(`/${folder}`) ||
      clean.includes(`/${folder}/`) ||
      clean === name ||
      clean.startsWith(`${name}/`) ||
      clean.includes(`/${name}/`)
    );
  });
}

async function findMirror(
  teacherId: string,
  documentId: string,
  path: string,
  folderPath: string,
) {
  const admin = createSupabaseAdminClient();
  const columns =
    "id,teacher_id,external_document_id,collection_path,storage_path,original_name,mime_type";

  const byExternalId = await admin
    .from("teacher_document_files")
    .select(columns)
    .eq("teacher_id", teacherId)
    .eq("external_document_id", documentId)
    .maybeSingle();
  if (byExternalId.error) throw byExternalId.error;
  if (byExternalId.data) return byExternalId.data as MirrorFile;

  for (const candidate of pathCandidates(path, folderPath)) {
    const byPath = await admin
      .from("teacher_document_files")
      .select(columns)
      .eq("teacher_id", teacherId)
      .eq("collection_path", candidate)
      .maybeSingle();
    if (byPath.error) throw byPath.error;
    if (byPath.data) return byPath.data as MirrorFile;
  }

  const byMirrorId = await admin
    .from("teacher_document_files")
    .select(columns)
    .eq("teacher_id", teacherId)
    .eq("id", documentId)
    .maybeSingle();
  if (byMirrorId.error) throw byMirrorId.error;
  return (byMirrorId.data as MirrorFile | null) || null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function findDirectMirror(documentId: string) {
  const admin = createSupabaseAdminClient();
  const columns =
    "id,teacher_id,external_document_id,collection_path,storage_path,original_name,mime_type";

  if (isUuid(documentId)) {
    const byId = await admin
      .from("teacher_document_files")
      .select(columns)
      .eq("id", documentId)
      .maybeSingle();
    if (byId.error) throw byId.error;
    if (byId.data) return byId.data as MirrorFile;
  }

  const byExternalId = await admin
    .from("teacher_document_files")
    .select(columns)
    .eq("external_document_id", documentId)
    .maybeSingle();
  if (byExternalId.error) throw byExternalId.error;
  return (byExternalId.data as MirrorFile | null) || null;
}

async function mirrorResponse(
  request: Request,
  userId: string,
  mirror: MirrorFile,
) {
  const admin = createSupabaseAdminClient();
  const access = await getStudentCourseSubjectAccessForDocumentPath(
    userId,
    mirror.teacher_id,
    mirror.collection_path,
    admin,
  );
  if (!access) {
    return NextResponse.json(
      { error: "Join the subject's community or enroll in its course first." },
      { status: 403 },
    );
  }

  if (new URL(request.url).searchParams.get("metadata") === "1") {
    let document: Record<string, unknown> = {
      id: mirror.id,
      path: mirror.collection_path,
      source_path: mirror.collection_path,
      status: mirror.external_document_id ? "indexed" : "uploaded",
      indexed: Boolean(mirror.external_document_id),
      subject: access.subjectName,
    };

    if (mirror.external_document_id) {
      const teacherResult = await admin
        .from("teachers")
        .select("collection_sk")
        .eq("id", mirror.teacher_id)
        .maybeSingle();
      if (teacherResult.error) throw teacherResult.error;
      if (teacherResult.data?.collection_sk) {
        try {
          const remoteDocument = await getTeacherDocument(
            teacherResult.data.collection_sk,
            mirror.external_document_id,
          );
          document = {
            ...document,
            ...remoteDocument,
            indexing_cost:
              remoteDocument.indexing_cost ?? remoteDocument.indexing_cost_usd,
          };
        } catch {
          // The mirrored file remains readable even if metadata is temporarily unavailable.
        }
      }
    }

    return NextResponse.json(
      { document },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  }

  if (!mirror.storage_path) {
    return NextResponse.json(
      { error: "A preview is not available for this older material yet." },
      { status: 404 },
    );
  }

  const download = await admin.storage.from("teacher-documents").download(mirror.storage_path);
  if (download.error || !download.data) throw download.error || new Error("File unavailable.");
  const body = await download.data.arrayBuffer();
  const name = mirror.original_name || mirror.collection_path.split("/").pop() || "file";
  const disposition = new URL(request.url).searchParams.get("download") === "1"
    ? "attachment"
    : "inline";

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": mirror.mime_type || download.data.type || "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${name.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}

/**
 * Streams one of a teacher's files back to the student. Collection credentials
 * never reach the browser, and access is checked through community membership
 * or course enrollment.
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

    const directMirror = await findDirectMirror(documentId);
    if (directMirror) {
      return await mirrorResponse(request, user.id, directMirror);
    }

    const admin = createSupabaseAdminClient();
    const [tree, subjects] = await Promise.all([getTenantSourceTree(), listTenantSubjects()]);
    const treePath = findDocumentPath(tree.tree ?? [], documentId);
    let mirrorOwner: { teacher_id: string; collection_path: string } | null = null;
    if (treePath === null) {
      const mirrorResult = await admin
        .from("teacher_document_files")
        .select("teacher_id,collection_path")
        .eq("id", documentId)
        .maybeSingle();
      if (mirrorResult.error) throw mirrorResult.error;
      mirrorOwner = mirrorResult.data;
    }
    const path = treePath ?? mirrorOwner?.collection_path ?? "";
    if (!path) return NextResponse.json({ error: "File not found." }, { status: 404 });

    const subject = subjectForPath(subjects, path);
    if (!subject) {
      return NextResponse.json({ error: "That file is not available." }, { status: 403 });
    }
    const access = await getStudentCourseSubjectAccess(user.id, subject.slug, admin);
    if (!access || (mirrorOwner && mirrorOwner.teacher_id !== access.teacherId)) {
      return NextResponse.json(
        { error: "Join the subject's community or enroll in its course first." },
        { status: 403 },
      );
    }

    const teacherResult = await admin
      .from("teachers")
      .select("collection_sk")
      .eq("id", access.teacherId)
      .maybeSingle();
    if (teacherResult.error) throw teacherResult.error;
    if (!teacherResult.data?.collection_sk) {
      return NextResponse.json({ error: "This material source is unavailable." }, { status: 503 });
    }

    if (new URL(request.url).searchParams.get("metadata") === "1") {
      let document: Record<string, unknown>;
      let resolvedDocumentId = treePath === null ? "" : documentId;
      if (!resolvedDocumentId) {
        const documents = await getTeacherDocuments(teacherResult.data.collection_sk);
        const expectedPaths = new Set(pathCandidates(path, access.folderPath));
        const match = documentRows(documents).find((item) =>
          pathCandidates(documentPath(item), access.folderPath).some((candidate) =>
            expectedPaths.has(candidate),
          ),
        );
        resolvedDocumentId = match ? backendDocumentId(match) : "";
        if (resolvedDocumentId && mirrorOwner) {
          await admin
            .from("teacher_document_files")
            .update({ external_document_id: resolvedDocumentId })
            .eq("id", documentId)
            .eq("teacher_id", access.teacherId);
        }
      }
      try {
        if (!resolvedDocumentId) throw new TeacherApiError("Document not found", 404);
        document = await getTeacherDocument(
          teacherResult.data.collection_sk,
          resolvedDocumentId,
        );
        if (document.indexing_cost === undefined && document.indexing_cost_usd !== undefined) {
          document = { ...document, indexing_cost: document.indexing_cost_usd };
        }
      } catch (error) {
        const mirror = await findMirror(
          access.teacherId,
          documentId,
          path,
          access.folderPath,
        );
        if (!(error instanceof TeacherApiError) || error.status !== 404 || !mirror) throw error;
        document = {
          id: mirror.id,
          path: mirror.collection_path,
          source_path: mirror.collection_path,
          status: "indexed",
          indexed: true,
          subject: access.subjectName,
        };
      }
      return NextResponse.json(
        { document },
        { headers: { "Cache-Control": "private, max-age=60" } },
      );
    }

    const mirror = await findMirror(access.teacherId, documentId, path, access.folderPath);
    if (!mirror?.storage_path) {
      return NextResponse.json(
        { error: "A preview is not available for this older material yet." },
        { status: 404 },
      );
    }

    const download = await admin.storage.from("teacher-documents").download(mirror.storage_path);
    if (download.error || !download.data) throw download.error || new Error("File unavailable.");
    const body = await download.data.arrayBuffer();
    const name = mirror.original_name || path.split("/").pop() || "file";

    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": mirror.mime_type || download.data.type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${name.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: message || "Could not fetch that file." }, { status: 502 });
  }
}
