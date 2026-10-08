import { NextResponse } from "next/server";
import { assertSuperAdminRequest } from "@/lib/admin-access";
import { assertScopedAdmin, outOfScope, scopeAllowsUser } from "@/lib/admin-scope";
import { userRoleUpdateSchema } from "@/lib/admin/schemas";
import { AdminRoleError, getAdminUserDetail, updateAdminUserRole } from "@/lib/data/admin-users";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const access = await assertScopedAdmin();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { userId } = await params;
    if (!(await scopeAllowsUser(access.scope, userId))) return outOfScope("students");
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
  const access = await assertSuperAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { userId } = await params;
    const payload = userRoleUpdateSchema.parse(await request.json());
    const user = await updateAdminUserRole({
      actorUserId: access.userId,
      userId,
      role: payload.role,
      siteSlug: payload.siteSlug,
    });
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof AdminRoleError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update user role." },
      { status: 500 },
    );
  }
}
