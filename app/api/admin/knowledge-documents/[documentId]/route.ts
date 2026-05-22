import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { knowledgeDocumentInputSchema } from "@/lib/admin/schemas";
import {
  deleteAdminKnowledgeDocument,
  getAdminKnowledgeDocument,
  updateAdminKnowledgeDocument,
} from "@/lib/data/admin-knowledge";

function toInput(payload: ReturnType<typeof knowledgeDocumentInputSchema.parse>) {
  return {
    ...payload,
    chapter: payload.chapter?.trim() || null,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { documentId } = await params;
    const document = await getAdminKnowledgeDocument(documentId);
    if (!document) {
      return NextResponse.json({ error: "Knowledge document not found." }, { status: 404 });
    }
    return NextResponse.json({ document });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load knowledge document." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { documentId } = await params;
    const payload = knowledgeDocumentInputSchema.parse(await request.json());
    const document = await updateAdminKnowledgeDocument(documentId, toInput(payload));
    return NextResponse.json({ document });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update knowledge document." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { documentId } = await params;
    await deleteAdminKnowledgeDocument(documentId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete knowledge document." },
      { status: 500 },
    );
  }
}
