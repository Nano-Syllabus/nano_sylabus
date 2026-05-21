import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-access";
import {
  createAdminKnowledgeDocument,
  listAdminKnowledgeDocuments,
  type AdminKnowledgeDocumentInput,
} from "@/lib/data/admin-knowledge";

const documentSchema = z.object({
  notebookId: z.string().trim().min(1),
  board: z.string().trim().min(1),
  grade: z.string().trim().min(1),
  faculty: z.string().trim().default(""),
  curriculum: z.string().trim().default(""),
  subject: z.string().trim().min(1),
  chapter: z.string().trim().nullable().optional(),
  resourceKind: z.enum(["syllabus", "study_material", "question_bank"]),
  resourceSubtype: z.enum([
    "micro_syllabus",
    "curriculum",
    "syllabus",
    "learning_outcomes",
    "textbook",
    "notes",
    "solutions",
    "guides",
    "question_bank",
    "past_questions",
    "example_questions",
    "other",
  ]),
  title: z.string().trim().min(1),
  sourceName: z.string().trim().min(1),
  sourceType: z.string().trim().min(1),
  rawContent: z.string().trim().min(1),
});

function toInput(payload: z.infer<typeof documentSchema>): AdminKnowledgeDocumentInput {
  return {
    ...payload,
    chapter: payload.chapter?.trim() || null,
  };
}

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

export async function GET(request: Request) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const result = await listAdminKnowledgeDocuments({
      q: searchParams.get("q") ?? undefined,
      notebookId: searchParams.get("notebookId") ?? undefined,
      page: parsePositiveInt(searchParams.get("page"), 1),
      pageSize: parsePositiveInt(searchParams.get("pageSize"), 50),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load knowledge documents." },
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
    const payload = documentSchema.parse(await request.json());
    const document = await createAdminKnowledgeDocument(toInput(payload));
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create knowledge document." },
      { status: 500 },
    );
  }
}
