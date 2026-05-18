import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-access";
import { getAdminAnswerDetail, updateAdminAnswerReview } from "@/lib/data/admin-answers";

const answerReviewSchema = z.object({
  reviewed: z.boolean().optional(),
  adminReviewNote: z.string().trim().max(4000).nullable().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { messageId } = await params;
    const answer = await getAdminAnswerDetail(messageId);
    if (!answer) {
      return NextResponse.json({ error: "AI answer not found." }, { status: 404 });
    }
    return NextResponse.json({ answer });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load AI answer." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const payload = answerReviewSchema.parse(await request.json());
    const { messageId } = await params;
    const answer = await updateAdminAnswerReview(messageId, {
      adminUserId: access.userId,
      reviewed: payload.reviewed,
      adminReviewNote: payload.adminReviewNote,
    });

    if (!answer) {
      return NextResponse.json({ error: "AI answer not found." }, { status: 404 });
    }

    return NextResponse.json({ answer });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update AI answer review." },
      { status: 500 },
    );
  }
}
