import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { parseAdminListQuery } from "@/lib/admin/list-query";
import { notebookInputSchema } from "@/lib/admin/schemas";
import { createAdminKnowledgeNotebook, listAdminKnowledgeNotebooks } from "@/lib/data/admin-knowledge";

function toInput(payload: ReturnType<typeof notebookInputSchema.parse>) {
  return payload;
}

export async function GET(request: Request) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = parseAdminListQuery(searchParams);
    const result = await listAdminKnowledgeNotebooks({
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
    });
    return NextResponse.json(result);
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
    const payload = notebookInputSchema.parse(await request.json());
    const notebook = await createAdminKnowledgeNotebook(toInput(payload));
    return NextResponse.json({ notebook }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create notebook." },
      { status: 500 },
    );
  }
}
