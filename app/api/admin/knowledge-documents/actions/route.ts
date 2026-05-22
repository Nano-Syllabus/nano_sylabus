import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { bulkKnowledgeActionSchema } from "@/lib/admin/schemas";
import { bulkProcessAdminKnowledgeDocuments } from "@/lib/data/admin-knowledge";

export async function POST(request: Request) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const payload = bulkKnowledgeActionSchema.parse(await request.json());

    if (payload.action === "process") {
      const result = await bulkProcessAdminKnowledgeDocuments(payload.documentIds);
      return NextResponse.json({
        ok: true,
        action: payload.action,
        ...result,
      });
    }

    return NextResponse.json({ error: "Unsupported bulk knowledge action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run bulk knowledge action." },
      { status: 500 },
    );
  }
}
