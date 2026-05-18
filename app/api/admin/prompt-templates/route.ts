import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-access";
import {
  createPromptTemplate,
  listPromptTemplates,
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

export async function GET(request: Request) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const prompts = await listPromptTemplates({
      q: searchParams.get("q") ?? undefined,
    });
    return NextResponse.json({ prompts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load prompt templates." },
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
    const payload = promptSchema.parse(await request.json());
    const prompt = await createPromptTemplate(toInput(payload), access.userId);
    return NextResponse.json({ prompt }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create prompt template." },
      { status: 500 },
    );
  }
}
