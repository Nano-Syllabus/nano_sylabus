import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { parseAdminListQuery } from "@/lib/admin/list-query";
import { knowledgeDocumentInputSchema } from "@/lib/admin/schemas";
import {
  createAdminKnowledgeDocument,
  listAdminKnowledgeDocuments,
} from "@/lib/data/admin-knowledge";

function toInput(payload: ReturnType<typeof knowledgeDocumentInputSchema.parse>) {
  return {
    ...payload,
    chapter: payload.chapter?.trim() || null,
  };
}

export async function GET(request: Request) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = parseAdminListQuery(searchParams);
    const result = await listAdminKnowledgeDocuments({
      q: query.q,
      notebookId: searchParams.get("notebookId") ?? undefined,
      page: query.page,
      pageSize: query.pageSize,
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
    const payload = knowledgeDocumentInputSchema.parse(await request.json());
    const document = await createAdminKnowledgeDocument(toInput(payload));
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create knowledge document." },
      { status: 500 },
    );
  }
}
