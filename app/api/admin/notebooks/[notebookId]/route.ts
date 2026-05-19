import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-access";
import {
  deleteAdminKnowledgeNotebook,
  getAdminKnowledgeNotebook,
  updateAdminKnowledgeNotebook,
  type AdminKnowledgeNotebookInput,
} from "@/lib/data/admin-knowledge";

const notebookSchema = z.object({
  title: z.string().trim().min(1),
  board: z.string().trim().min(1),
  level: z.string().trim().min(1),
  faculty: z.string().trim().default(""),
  subject: z.string().trim().min(1),
  curriculum: z.string().trim().default(""),
  description: z.string().trim().default(""),
});

function toInput(payload: z.infer<typeof notebookSchema>): AdminKnowledgeNotebookInput {
  return payload;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ notebookId: string }> },
) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { notebookId } = await params;
    const notebook = await getAdminKnowledgeNotebook(notebookId);
    if (!notebook) {
      return NextResponse.json({ error: "Notebook not found." }, { status: 404 });
    }
    return NextResponse.json({ notebook });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load notebook." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ notebookId: string }> },
) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { notebookId } = await params;
    const payload = notebookSchema.parse(await request.json());
    const notebook = await updateAdminKnowledgeNotebook(notebookId, toInput(payload));
    return NextResponse.json({ notebook });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update notebook." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ notebookId: string }> },
) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { notebookId } = await params;
    await deleteAdminKnowledgeNotebook(notebookId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete notebook." },
      { status: 500 },
    );
  }
}
