import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { parseAdminListQuery } from "@/lib/admin/list-query";
import { listAdminUsers } from "@/lib/data/admin-users";

export async function GET(request: Request) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = parseAdminListQuery(searchParams);
    const role = (["students", "admins", "ambassadors"] as const).find(
      (value) => value === searchParams.get("role"),
    );
    // Who may create faculties is a super admin's list, like the switch that edits it.
    if (role === "ambassadors" && access.role !== "super_admin") {
      return NextResponse.json(
        { error: "Only a super admin can see ambassadors." },
        { status: 403 },
      );
    }
    const result = await listAdminUsers({
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
      role,
      faculty: searchParams.get("faculty")?.slice(0, 100) || undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load users." },
      { status: 500 },
    );
  }
}
