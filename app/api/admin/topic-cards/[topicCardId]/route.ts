import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { topicCardInputSchema } from "@/lib/admin/schemas";
import { deleteAdminTopicCard, updateAdminTopicCard } from "@/lib/data/admin-knowledge";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ topicCardId: string }> },
) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { topicCardId } = await params;
    const payload = topicCardInputSchema.parse(await request.json());
    const topicCard = await updateAdminTopicCard(topicCardId, {
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
    return NextResponse.json({ topicCard });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update topic card." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ topicCardId: string }> },
) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { topicCardId } = await params;
    await deleteAdminTopicCard(topicCardId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete topic card." },
      { status: 500 },
    );
  }
}
