import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { seedAdminTopicCardsForDocument } from "@/lib/data/admin-knowledge";

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
    const topicCards = await seedAdminTopicCardsForDocument(documentId);
    return NextResponse.json({ topicCards });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate topic cards." },
      { status: 500 },
    );
  }
}
