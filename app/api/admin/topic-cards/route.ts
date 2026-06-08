import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { topicCardInputSchema } from "@/lib/admin/schemas";
import { createAdminTopicCard } from "@/lib/data/admin-knowledge";

export async function POST(request: Request) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const payload = topicCardInputSchema.parse(await request.json());
    const topicCard = await createAdminTopicCard({
      documentId: payload.documentId,
      board: payload.board,
      grade: payload.grade,
      subject: payload.subject,
      chapter: payload.chapter?.trim() || null,
      topic: payload.topic,
      title: payload.title,
      keyTerms: payload.keyTerms,
      coreExplanation: payload.coreExplanation,
      formulaSheet: payload.formulaSheet,
      exampleLine: payload.exampleLine ?? null,
      commonMistake: payload.commonMistake ?? null,
      examAngle: payload.examAngle ?? null,
      status: payload.status,
    });
    return NextResponse.json({ topicCard }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create topic card." },
      { status: 500 },
    );
  }
}
