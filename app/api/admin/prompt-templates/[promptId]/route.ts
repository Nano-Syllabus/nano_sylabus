import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-access";
import {
  deletePromptTemplate,
  getPromptTemplate,
  updatePromptTemplate,
  type AdminPromptTemplateInput,
} from "@/lib/data/admin-prompts";

const promptSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().default(""),
  purpose: z.enum(["system", "followup", "rewrite"]),
  language: z.enum(["EN", "RN"]),
  description: z.string().trim().default(""),
  content: z.string().trim().min(1),
  isActive: z.boolean().default(false),
});

function toInput(payload: z.infer<typeof promptSchema>): AdminPromptTemplateInput {
  return payload;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ promptId: string }> },
) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { promptId } = await params;
    const prompt = await getPromptTemplate(promptId);
    if (!prompt) {
      return NextResponse.json({ error: "Prompt template not found." }, { status: 404 });
    }
    return NextResponse.json({ prompt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load prompt template." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ promptId: string }> },
) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { promptId } = await params;
    const payload = promptSchema.parse(await request.json());
    const prompt = await updatePromptTemplate(promptId, toInput(payload), access.userId);
    return NextResponse.json({ prompt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update prompt template." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ promptId: string }> },
) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { promptId } = await params;
    await deletePromptTemplate(promptId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete prompt template." },
      { status: 500 },
    );
  }
}
