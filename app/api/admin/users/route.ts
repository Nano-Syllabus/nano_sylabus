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
    const result = await listAdminUsers({
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load users." },
      { status: 500 },
    );
  }
}
