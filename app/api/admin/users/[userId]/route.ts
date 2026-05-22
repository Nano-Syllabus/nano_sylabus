import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { userRoleUpdateSchema } from "@/lib/admin/schemas";
import { getAdminUserDetail, updateAdminUserRole } from "@/lib/data/admin-users";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { userId } = await params;
    const user = await getAdminUserDetail(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load user detail." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { userId } = await params;
    const payload = userRoleUpdateSchema.parse(await request.json());
    const user = await updateAdminUserRole(userId, payload.role);
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update user role." },
      { status: 500 },
    );
  }
}
