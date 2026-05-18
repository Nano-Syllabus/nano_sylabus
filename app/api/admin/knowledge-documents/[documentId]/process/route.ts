import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { processAdminKnowledgeDocument } from "@/lib/data/admin-knowledge";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { documentId } = await params;
    const document = await processAdminKnowledgeDocument(documentId);
    return NextResponse.json({ document });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process knowledge document." },
      { status: 500 },
    );
  }
}
