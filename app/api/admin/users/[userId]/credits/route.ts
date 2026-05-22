import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { userCreditAdjustmentSchema } from "@/lib/admin/schemas";
import { adjustAdminUserCredits } from "@/lib/data/admin-users";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { userId } = await params;
    const payload = userCreditAdjustmentSchema.parse(await request.json());
    const user = await adjustAdminUserCredits({
      userId,
      amount: payload.amount,
      description: payload.description,
      adminUserId: access.userId,
    });
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to adjust user credits." },
      { status: 500 },
    );
  }
}
