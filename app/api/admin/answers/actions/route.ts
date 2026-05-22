import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { bulkAnswerActionSchema } from "@/lib/admin/schemas";
import { bulkUpdateAdminAnswerReview } from "@/lib/data/admin-answers";

export async function POST(request: Request) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const payload = bulkAnswerActionSchema.parse(await request.json());
    const result = await bulkUpdateAdminAnswerReview(payload.messageIds, {
      adminUserId: access.userId,
      reviewed: payload.action === "mark_reviewed",
      adminReviewNote: payload.adminReviewNote,
    });

    return NextResponse.json({
      ok: true,
      action: payload.action,
      updatedCount: result.updatedCount,
      messageIds: result.messageIds,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run bulk answer action." },
      { status: 500 },
    );
  }
}
