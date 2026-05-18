import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-access";
import {
  deleteAdminKnowledgeDocument,
  getAdminKnowledgeDocument,
  updateAdminKnowledgeDocument,
  type AdminKnowledgeDocumentInput,
} from "@/lib/data/admin-knowledge";

const documentSchema = z.object({
  board: z.string().trim().min(1),
  grade: z.string().trim().min(1),
  faculty: z.string().trim().default(""),
  curriculum: z.string().trim().default(""),
  subject: z.string().trim().min(1),
  chapter: z.string().trim().nullable().optional(),
  title: z.string().trim().min(1),
  sourceName: z.string().trim().min(1),
  sourceType: z.string().trim().min(1),
  documentType: z.enum([
    "micro_syllabus",
    "question_bank",
    "textbook",
    "notes",
    "curriculum",
    "syllabus",
    "other",
  ]),
  rawContent: z.string().trim().min(1),
});

function toInput(payload: z.infer<typeof documentSchema>): AdminKnowledgeDocumentInput {
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
    const payload = documentSchema.parse(await request.json());
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
