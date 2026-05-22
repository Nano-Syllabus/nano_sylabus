import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { bulkUserActionSchema } from "@/lib/admin/schemas";
import { bulkUpdateAdminUserRoles } from "@/lib/data/admin-users";

export async function POST(request: Request) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const payload = bulkUserActionSchema.parse(await request.json());
    const result = await bulkUpdateAdminUserRoles({
      role: payload.role,
      userIds: payload.userIds,
    });

    return NextResponse.json({
      ok: true,
      action: payload.action,
      role: payload.role,
      updatedCount: result.updatedCount,
      userIds: result.userIds,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run bulk user action." },
      { status: 500 },
    );
  }
}
