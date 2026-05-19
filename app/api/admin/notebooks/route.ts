import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-access";
import {
  createAdminKnowledgeNotebook,
  listAdminKnowledgeNotebooks,
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

export async function GET(request: Request) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const notebooks = await listAdminKnowledgeNotebooks({
      q: searchParams.get("q") ?? undefined,
    });
    return NextResponse.json({ notebooks });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load notebooks." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const payload = notebookSchema.parse(await request.json());
    const notebook = await createAdminKnowledgeNotebook(toInput(payload));
    return NextResponse.json({ notebook }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create notebook." },
      { status: 500 },
    );
  }
}
